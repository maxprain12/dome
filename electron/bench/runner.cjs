/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const agentRuntime = require('../agents/agent-runtime.cjs');
const database = require('../core/database.cjs');
const { normalizeToolName, executeToolInMain } = require('../tools/tool-dispatcher.cjs');
const { parseTextToolInvokes } = require('./parse-text-tool-invokes.cjs');
const { buildBenchSystemPrompt, BENCH_PROJECT_ID } = require('./bench-prompt.cjs');
const { getToolDefinitionsForCase } = require('./tool-scope.cjs');
const { parseRuntimeContext } = require('../agents/agent-runtime-context.cjs');
const { getBenchProviderConfig } = require('./provider-config.cjs');
const { validateExecution, validateStructural, deriveOutcome } = require('./validators.cjs');
const { runJudge } = require('./judge.cjs');
const { writeCaseResult } = require('./storage.cjs');

const CASES_DIR = path.join(__dirname, '../../scripts/bench/cases');

/** Match case id / category / tool against one substring (case-insensitive). */
function caseMatchesPart(c, part) {
  const p = part.toLowerCase();
  if (!p) return false;
  return (
    c.id?.toLowerCase().includes(p) ||
    c.category?.toLowerCase().includes(p) ||
    c.tool?.toLowerCase().includes(p)
  );
}

/**
 * --grep supports:
 * - substring: `web` → id/category/tool contains "web"
 * - alternation: `generate_|ui_|file_` or `studio,ui,file` (category names work)
 */
function caseMatchesGrep(c, grep) {
  const g = String(grep).trim();
  if (!g) return true;
  if (g.includes('|') || g.includes(',')) {
    const parts = g.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    return parts.some((part) => caseMatchesPart(c, part));
  }
  return caseMatchesPart(c, g);
}

function loadCaseFiles({ grep, caseId, modeFilter, categories }) {
  if (!fs.existsSync(CASES_DIR)) return [];

  const files = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.json')) files.push(full);
    }
  }
  walk(CASES_DIR);

  let cases = files.map((f) => {
    const raw = JSON.parse(fs.readFileSync(f, 'utf-8'));
    return { ...raw, _file: f };
  });

  if (caseId) cases = cases.filter((c) => c.id === caseId);
  if (categories?.length) {
    const cats = new Set(categories.map((x) => String(x).toLowerCase().trim()).filter(Boolean));
    cases = cases.filter((c) => cats.has((c.category || '').toLowerCase()));
  }
  if (grep) {
    cases = cases.filter((c) => caseMatchesGrep(c, grep));
  }
  if (modeFilter && modeFilter !== 'both') {
    cases = cases.filter((c) => c.mode === modeFilter || c.mode === 'both');
  }

  return cases.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
}

function expandCasesForMode(cases, modeFilter) {
  if (modeFilter === 'both') {
    const expanded = [];
    for (const c of cases) {
      if (c.mode === 'both') {
        expanded.push({ ...c, mode: 'direct', id: `${c.id}.direct` });
        expanded.push({ ...c, mode: 'supervisor', id: `${c.id}.supervisor` });
      } else {
        expanded.push(c);
      }
    }
    return expanded;
  }
  return cases;
}

function collectChunks(onChunkList) {
  return (data) => {
    onChunkList.push({ ts: Date.now(), ...data });
  };
}

function extractToolsFromChunks(chunks) {
  const names = new Set();
  for (const c of chunks) {
    if (c.type !== 'tool_call') continue;
    const raw =
      c.toolCall?.name ||
      c.name ||
      (typeof c.tool_call === 'object' ? c.tool_call?.name : null);
    if (raw) names.add(normalizeToolName(raw));
  }
  return [...names];
}

function extractUsage(chunks) {
  let usage = null;
  for (const c of chunks) {
    if (c.type === 'usage' && c.usage) {
      usage = {
        inputTokens: (usage?.inputTokens || 0) + (c.usage.inputTokens || 0),
        outputTokens: (usage?.outputTokens || 0) + (c.usage.outputTokens || 0),
        totalTokens: (usage?.totalTokens || 0) + (c.usage.totalTokens || 0),
      };
    }
  }
  return usage;
}

function buildMessages(caseDef, fixtureIds) {
  const system = buildBenchSystemPrompt(caseDef, fixtureIds);

  const scopeLine = `Ámbito: solo proyecto ${BENCH_PROJECT_ID}. IDs de fixture: ${fixtureIds.length ? fixtureIds.join(', ') : 'ninguno'}. Herramienta objetivo: ${caseDef.tool || 'según mensaje'}. No explores el código de Dome ni el filesystem del desarrollador.`;
  let userContent = `${caseDef.prompt}\n\n${scopeLine}`;

  if (caseDef.tool === 'image_thumbnail') {
    try {
      database.initDatabase();
      const pngPath = database.getQueries().getSetting.get('bench_sample_png_path')?.value;
      if (pngPath) {
        userContent += `\nRuta absoluta de la imagen: ${pngPath}`;
      }
    } catch {
      /* bench DB may be unavailable during dry-run */
    }
  }

  if (caseDef.context_resource_id) {
    return [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `${userContent}\nRecurso activo: ${caseDef.context_resource_id}`,
      },
    ];
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}

/** Recover MiniMax-style XML tool invokes from assistant text into trace + execution. */
async function recoverTextToolInvokes(chunks, finalText, caseDef, toolContext) {
  const primary = caseDef.tool ? normalizeToolName(caseDef.tool) : null;
  if (!primary) return;

  const allowed = new Set([primary]);
  const invokes = parseTextToolInvokes(finalText);
  if (!invokes.length) return;

  const already = new Set(extractToolsFromChunks(chunks));
  let counter = 0;
  for (const inv of invokes) {
    if (inv.name !== primary) continue;
    if (already.has(inv.name)) continue;

    const id = `bench_text_${counter++}`;
    const argsStr = JSON.stringify(inv.args || {});
    chunks.push({
      ts: Date.now(),
      type: 'tool_call',
      toolCall: { id, name: inv.name, arguments: argsStr },
      recoveredFromText: true,
    });
    already.add(inv.name);

    try {
      const result = await executeToolInMain(inv.name, inv.args, toolContext);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      chunks.push({
        ts: Date.now(),
        type: 'tool_result',
        toolCallId: id,
        result: resultStr,
        recoveredFromText: true,
      });
    } catch (err) {
      chunks.push({
        ts: Date.now(),
        type: 'tool_result',
        toolCallId: id,
        result: JSON.stringify({ error: err?.message || String(err) }),
        recoveredFromText: true,
      });
    }
  }
}

/** Override false-negative judge when structural checks already prove tool invocation. */
function reconcileJudge(judge, caseDef, toolsCalled, structural) {
  if (!judge || judge.skipped || judge.pass) return judge;
  if (!structural.pass) return judge;

  const expected =
    caseDef.expected_tools?.length > 0
      ? caseDef.expected_tools
      : caseDef.tool && !caseDef.explain_only
        ? [caseDef.tool]
        : [];
  if (!expected.length) return judge;

  const called = new Set(toolsCalled || []);
  if (!expected.every((t) => called.has(t))) return judge;

  return {
    ...judge,
    pass: true,
    reasoning: `${judge.reasoning || ''} [bench: herramientas esperadas invocadas: ${expected.join(', ')}]`.trim(),
    reconciled: true,
  };
}

async function runSingleCase(caseDef, opts) {
  const startTime = Date.now();
  const chunks = [];
  const onChunk = collectChunks(chunks);
  const controller = new AbortController();
  const timeoutMs = caseDef.timeout_ms || opts.timeoutMs || 60000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const providerConfig = await getBenchProviderConfig(opts.provider, opts.model);
  const useDirectTools = caseDef.mode !== 'supervisor';
  const toolDefinitions = useDirectTools ? getToolDefinitionsForCase(caseDef) : [];
  if (useDirectTools && caseDef.tool && toolDefinitions.length === 0) {
    console.warn(`[Bench] No OpenAI tool definitions resolved for: ${caseDef.tool}`);
  }
  const threadId = `bench_${caseDef.id}_${crypto.randomUUID().slice(0, 8)}`;

  let finalText = '';
  let error = null;
  // HITL interrupts were a LangGraph feature; the Dome-native runtime does not
  // interrupt mid-run. Kept for the result shape consumed downstream.
  const hitInterrupt = false;

  const fixtureIds = caseDef.fixtures || [];

  try {
    const messages = buildMessages(caseDef, fixtureIds);
    const invokeOpts = {
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      messages,
      toolDefinitions,
      useDirectTools,
      skipHitl: caseDef.skip_hitl !== false,
      threadId,
      signal: controller.signal,
      onChunk: (data) => {
        onChunk(data);
        if (data?.type === 'text' && data.text) finalText += data.text;
      },
      runtimeContext: parseRuntimeContext({
        activeResourceId: caseDef.context_resource_id || null,
        pinnedResourceIds:
          caseDef.tool === 'resource_get_pinned' ? (caseDef.fixtures || []) : [],
      }),
      automationProjectId: BENCH_PROJECT_ID,
    };

    // HITL interrupt/resume was a LangGraph checkpointer feature; the
    // Dome-native runtime runs straight through (bench cases run with
    // skip_hitl). The final text is accumulated via the onChunk handler above.
    const result = await agentRuntime.runAgent('bench', invokeOpts);
    if (typeof result === 'string') {
      finalText = result || finalText;
    }
  } catch (err) {
    const isAbort = err?.name === 'AbortError';
    error = isAbort ? `Timeout after ${timeoutMs}ms` : (err?.message || String(err));
  } finally {
    clearTimeout(timeout);
  }

  if (useDirectTools && caseDef.tool && finalText) {
    await recoverTextToolInvokes(chunks, finalText, caseDef, {
      automationProjectId: BENCH_PROJECT_ID,
    });
  }

  const durationMs = Date.now() - startTime;
  const toolsCalled = extractToolsFromChunks(chunks);
  const usage = extractUsage(chunks);
  const timedOut = !!error && error.includes('Timeout');

  const execution = validateExecution({
    chunks,
    error,
    timedOut,
    hitInterrupt,
    skipHitl: caseDef.skip_hitl !== false,
  });

  const structural = validateStructural({
    expectedTools: caseDef.expected_tools || (caseDef.tool ? [caseDef.tool] : []),
    forbiddenTools: caseDef.forbidden_tools || [],
    toolsCalled,
    finalText,
    outputShape: caseDef.output_shape || null,
  });

  let judge = { skipped: true };
  if (!opts.noJudge && execution.pass) {
    judge = await runJudge({
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      userPrompt: caseDef.prompt,
      agentResponse: finalText,
      toolsCalled,
      criteria: caseDef.judge_criteria,
      signal: controller.signal,
    });
    judge.skipped = false;
    judge = reconcileJudge(judge, caseDef, toolsCalled, structural);
  }

  const outcome = deriveOutcome(
    execution,
    structural,
    judge,
    caseDef.optional === true,
    !execution.pass,
  );

  return {
    caseId: caseDef.id,
    category: caseDef.category,
    tool: caseDef.tool,
    mode: caseDef.mode,
    startTime,
    endTime: Date.now(),
    durationMs,
    provider: providerConfig.provider,
    model: providerConfig.model,
    chunks,
    finalText: finalText.slice(0, 50000),
    toolsCalled,
    expectedTools: caseDef.expected_tools || [],
    usage,
    error,
    validation: { execution, structural, judge },
    outcome,
  };
}

async function runCases(cases, opts, runDir) {
  const results = [];
  const concurrency = opts.concurrency || 1;
  let index = 0;

  async function worker() {
    while (index < cases.length) {
      const i = index++;
      const caseDef = cases[i];
      console.log(`[Bench] (${i + 1}/${cases.length}) ${caseDef.id} [${caseDef.mode}]`);
      if (opts.dryRun) {
        results.push({ caseId: caseDef.id, outcome: 'DRY_RUN', mode: caseDef.mode });
        continue;
      }
      const result = await runSingleCase(caseDef, opts);
      results.push(result);
      if (runDir) writeCaseResult(runDir, result);
      console.log(`[Bench]   → ${result.outcome} (${result.durationMs}ms) tools=[${(result.toolsCalled || []).join(', ')}]`);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

module.exports = {
  loadCaseFiles,
  expandCasesForMode,
  runCases,
  runSingleCase,
  CASES_DIR,
};
