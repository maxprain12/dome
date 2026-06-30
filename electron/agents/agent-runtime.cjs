'use strict';

/* eslint-disable no-console */
/**
 * Dome agent runtime.
 *
 * Drives `@dome/agent-core` (the Dome-native agent loop, vendored from a robust
 * upstream agent runtime) for every agent surface ("many", "agent-chat",
 * "workflows", "agent-team", "bench"). The loop is: stream → tools → repeat,
 * with argument validation, before/after tool hooks, sequential/parallel tool
 * execution and summarization-based compaction.
 *
 * The legacy LangGraph/LangChain agent stack has been removed; this
 * module is the single entry point for running an agent turn. The heavy
 * `@dome/agent-core` import is lazy so requiring this module never pulls the
 * ESM runtime into the CommonJS main process at load time.
 */

// Pure-CJS leaf (imports nothing) — safe to require at load without violating
// the "never pull the ESM runtime at load time" guarantee documented above.
const { safeStringify } = require('../tools/tool-result-cap.cjs');

const DEFAULT_RECURSION_LIMIT = 25;

/** Thrown when a tool requires HITL approval and the run should pause for resume. */
class HitlInterruptError extends Error {
  constructor(toolCall, reviewConfigs) {
    super('HITL interrupt');
    this.name = 'HitlInterruptError';
    // Contract with @dome/agent-core: interrupt-style errors thrown from hooks
    // propagate out of the loop/harness untouched instead of becoming an error
    // tool result (see prepareToolCall / normalizeHarnessError).
    this.isAgentInterrupt = true;
    this.toolCall = toolCall;
    this.reviewConfigs = reviewConfigs || [];
  }
}

/** Tools that require in-app approval before execution (HITL). */
const HITL_TOOL_NAMES = new Set([
  'resource_delete',
  'artifact_delete',
  'feeder_run',
  'ppt_create',
  'notebook_run_cell',
  'shell_exec',
  'email_send',
  'email_reply',
  'github_create_issue',
  'github_update_issue',
  'github_create_milestone',
]);

/** Per-conversation caps for creation/mutation tools (count over history). */
const CREATION_TOOL_CAPS = Object.freeze({
  resource_create: 20,
  resource_update: 30,
  resource_delete: 20,
  artifact_create: 15,
  artifact_update_state: 50,
  artifact_merge_data: 40,
  artifact_delete: 15,
  ppt_create: 8,
  flashcard_create: 8,
  generate_quiz: 5,
  generate_mindmap: 5,
  generate_guide: 5,
  generate_faq: 5,
  generate_timeline: 5,
  generate_table: 5,
  generate_audio_overview: 5,
  generate_video_overview: 5,
  notebook_add_cell: 50,
  pdf_annotation_create: 50,
  link_resources: 40,
  pipeline_create_card: 40,
  pipeline_add_stage: 15,
  pipeline_move_card: 60,
  pipeline_run_card: 30,
});

/** Total tool calls allowed per run (any tool); override with DOME_TOOL_CALL_LIMIT. */
const DEFAULT_GLOBAL_TOOL_CALL_LIMIT = 200;

/** Default per-tool cap for tools without an explicit entry in CREATION_TOOL_CAPS. */
const DEFAULT_PER_TOOL_CAP = 50;

/**
 * Mutation-heavy tools get N free invocations per run; past the threshold each
 * further call requires approval (or is blocked on unattended surfaces).
 */
const MUTATION_HITL_THRESHOLDS = Object.freeze({
  resource_update: 5,
  artifact_merge_data: 10,
});

/** Heuristics for obviously harmful patterns (NOT a security boundary). */
const HARMFUL_PATTERNS = [
  /\b(make|create|build|write|generate)\b.{0,40}\b(malware|ransomware|keylogger|trojan|rootkit|spyware|exploit kit)\b/i,
  /\b(step[- ]by[- ]step|instructions?|guide|how to)\b.{0,60}\b(synthesize|produce|manufacture)\b.{0,40}\b(fentanyl|sarin|vx gas|nerve agent|bioweapon|chemical weapon)\b/i,
  /\bgenerate\b.{0,30}\b(csam|child porn|child sexual)\b/i,
];

function recursionLimit() {
  const n = Number(process.env.DOME_RECURSION_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RECURSION_LIMIT;
}

/** Map provider `Usage` to the legacy renderer usage-chunk shape. */
function usageToLegacyChunk(usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    totalTokens: usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0),
  };
}

function piMessageToHistoryEntry(msg) {
  if (!msg) return { content: '' };
  if (typeof msg.content === 'string') return { content: msg.content };
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
    return { content: text };
  }
  return { content: '' };
}

/** Build the renderer budget breakdown from session + tools + system prompt. */
async function buildBudgetBreakdown(setup, opts = {}) {
  const { measurePromptDetailed } = require('../prompts/prompt-budget.cjs');
  const { session, core, baseSystemPrompt, tools, resources, mcpToolNames, subagentToolNames } = setup;
  const skillsBlock = core.formatSkillsForSystemPrompt(resources?.skills ?? []);
  const rulesBlock = typeof opts.userMemory === 'string' ? opts.userMemory : '';
  let baseSystem = baseSystemPrompt || '';
  if (rulesBlock && baseSystem.includes(rulesBlock)) {
    baseSystem = baseSystem.replace(rulesBlock, '').trim();
  }

  const subSet = new Set(subagentToolNames || ['task', 'delegate_to_agent']);
  const mcpSet = new Set(mcpToolNames || []);
  const domeTools = [];
  const mcpTools = [];
  const subagentTools = [];
  for (const t of tools || []) {
    if (subSet.has(t.name)) subagentTools.push(t);
    else if (mcpSet.has(t.name)) mcpTools.push(t);
    else domeTools.push(t);
  }

  const sessionCtx = await session.buildContext();
  const history = (sessionCtx.messages || [])
    .filter((m) => m && m.role !== 'system')
    .map(piMessageToHistoryEntry);

  let summarizedChars = 0;
  try {
    const branch = await session.getBranch();
    for (const entry of branch) {
      if (entry && entry.type === 'compaction' && typeof entry.summary === 'string') {
        summarizedChars += entry.summary.length;
      }
    }
  } catch {
    // optional
  }
  for (const m of history) {
    const text = typeof m.content === 'string' ? m.content : '';
    if (text.includes('[Conversation summary]')) {
      summarizedChars += text.length;
    }
  }

  const breakdown = measurePromptDetailed({
    baseSystem,
    skillsBlock,
    rulesBlock,
    domeTools: domeTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    mcpTools: mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    subagentTools: subagentTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    history,
    summarizedChars,
  });

  try {
    const estimate = core.estimateContextTokens(sessionCtx.messages || []);
    if (estimate.tokens > 0) breakdown.totalApprox = estimate.tokens;
  } catch {
    // keep char/4 total
  }
  return breakdown;
}

function emitBudgetChunk(onChunk, breakdown) {
  if (typeof onChunk !== 'function' || !breakdown) return;
  onChunk({ type: 'budget', breakdown });
}

function emitCompactionChunk(onChunk, payload) {
  if (typeof onChunk !== 'function' || !payload) return;
  onChunk({
    type: 'compaction',
    tokensBefore: payload.tokensBefore ?? 0,
    tokensAfter: payload.tokensAfter ?? null,
    summaryPreview: payload.summaryPreview ?? '',
    automatic: payload.automatic !== false,
  });
}

/**
 * Resolve which runtime a surface uses. Only the Dome-native runtime
 * (`@dome/agent-core`) exists; kept as a function for call sites and tests.
 */
function resolveRuntime() {
  return 'domeagent';
}

/** Join the text blocks of an assistant message's content array. */
function assistantText(message) {
  if (!message || !Array.isArray(message.content)) {
    if (message?.stopReason === 'error' && message?.errorMessage) return message.errorMessage;
    return '';
  }
  const text = message.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (text) return text;
  if (message.stopReason === 'error' && message.errorMessage) return message.errorMessage;
  return '';
}

/** Extract renderable text from an `AgentToolResult`. */
function toolResultText(result) {
  if (!result) return '';
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    if (text) return text;
  }
  if (result.details == null) return '';
  if (typeof result.details === 'string') return result.details;
  try {
    // safeStringify bounds serialization so a huge tool `details` payload can't
    // OOM the main process inside V8's JsonStringify (ELECTRON-7).
    return safeStringify(result.details);
  } catch {
    return String(result.details);
  }
}

/** Map the granular streaming event carried by `message_update`. */
function mapAssistantEventToChunk(ev) {
  if (!ev || typeof ev.type !== 'string') return null;
  switch (ev.type) {
    case 'text_delta':
      return { type: 'text', text: ev.delta };
    case 'thinking_delta':
      return { type: 'thinking', text: ev.delta };
    default:
      return null;
  }
}

/**
 * Map an `@dome/agent-core` `AgentEvent` to the legacy `onChunk` chunk shape
 * the renderer already consumes. Returns `null` for events with no equivalent.
 */
function mapAgentEventToChunk(event) {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'message_update':
      return mapAssistantEventToChunk(event.assistantMessageEvent);
    case 'tool_execution_start':
      return {
        type: 'tool_call',
        toolCall: {
          id: event.toolCallId,
          name: event.toolName,
          arguments:
            typeof event.args === 'string' ? event.args : JSON.stringify(event.args || {}),
        },
      };
    case 'tool_execution_end':
      return {
        type: 'tool_result',
        toolCallId: event.toolCallId,
        result: toolResultText(event.result),
      };
    case 'message_end': {
      const msg = event.message;
      if (!msg || msg.role !== 'assistant') return null;
      if (msg.stopReason === 'error') {
        return { type: 'error', error: msg.errorMessage || 'Agent error' };
      }
      if (msg.usage) {
        return { type: 'usage', usage: usageToLegacyChunk(msg.usage), partial: false };
      }
      return null;
    }
    case 'agent_end':
      return { type: 'done' };
    case 'turn_start':
      return { type: 'harness', event: 'turn_start' };
    case 'turn_end':
      return { type: 'harness', event: 'turn_end' };
    case 'tool_execution_update':
      return {
        type: 'tool_progress',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: toolResultText(event.partialResult),
      };
    default:
      return null;
  }
}

/** Read the last user message text from a pi message list. */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((b) => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
        .filter(Boolean)
        .join(' ');
    }
  }
  return '';
}

/** Last raw renderer user message (with attachments) from legacy message list. */
function lastRawUserMessage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user') return m;
  }
  return null;
}

function detectHarmfulContent(text) {
  if (!text || typeof text !== 'string') return null;
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) return 'Request blocked by Dome guardrails.';
  }
  return null;
}

/** Count how many times `toolName` was already requested across history. */
function countPriorToolCalls(messages, toolName) {
  if (!Array.isArray(messages) || !toolName) return 0;
  let count = 0;
  for (const m of messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block && block.type === 'toolCall' && block.name === toolName) count += 1;
    }
  }
  return count;
}

/** Count every tool call across history (global per-run budget). */
function countAllPriorToolCalls(messages) {
  if (!Array.isArray(messages)) return 0;
  let count = 0;
  for (const m of messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block && block.type === 'toolCall') count += 1;
    }
  }
  return count;
}

function globalToolCallLimit() {
  const n = Number(process.env.DOME_TOOL_CALL_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GLOBAL_TOOL_CALL_LIMIT;
}

/**
 * Build the `beforeToolCall` hook: enforces creation/mutation caps and (when
 * configured) human-in-the-loop approval. Returns `{ block, reason }` to deny.
 */
function buildBeforeToolCall(opts, caps) {
  const limits = { ...CREATION_TOOL_CAPS, ...(opts.caps || {}) };
  const requiresApproval = opts.skipHitl ? null : opts.requiresApproval;
  const requestApproval = opts.skipHitl ? null : opts.requestApproval;
  const hitlInterrupt = !opts.skipHitl && opts.hitlInterrupt === true;

  const needsApproval = (name) => {
    if (!requiresApproval) return false;
    if (typeof requiresApproval === 'function') return requiresApproval({ name });
    if (requiresApproval instanceof Set) return requiresApproval.has(name);
    if (Array.isArray(requiresApproval)) return requiresApproval.includes(name);
    return false;
  };

  return async function beforeToolCall(ctx) {
    const name = ctx?.toolCall?.name;
    if (!name) return undefined;

    // Global budget: total tool calls per run, regardless of tool.
    const totalPrior = countAllPriorToolCalls(ctx.context?.messages);
    const globalLimit = globalToolCallLimit();
    if (totalPrior > globalLimit) {
      return {
        block: true,
        reason:
          `Error: this run reached the global tool-call limit (${globalLimit}). ` +
          'Summarize the work done so far and finish without further tool calls.',
      };
    }

    // Caps: block when the cap has already been reached in history.
    // Tools without an explicit cap fall back to DEFAULT_PER_TOOL_CAP.
    const runLimit = typeof limits[name] === 'number' ? limits[name] : DEFAULT_PER_TOOL_CAP;
    if (typeof runLimit === 'number' && runLimit > 0) {
      const prior = countPriorToolCalls(ctx.context?.messages, name);
      if (prior > runLimit) {
        return {
          block: true,
          reason:
            `Error: tool "${name}" reached its run limit (${runLimit} invocations). ` +
            'The agent will continue without executing this call.',
        };
      }
    }

    // Mutation threshold: heavy mutators get a few free calls, then need approval.
    const mutationThreshold = MUTATION_HITL_THRESHOLDS[name];
    let thresholdApproval = false;
    if (typeof mutationThreshold === 'number' && !needsApproval(name)) {
      const prior = countPriorToolCalls(ctx.context?.messages, name);
      if (prior >= mutationThreshold) {
        if (hitlInterrupt || typeof requestApproval === 'function') {
          thresholdApproval = true;
        } else {
          // Unattended surface with no approval channel: deny instead of hanging.
          return {
            block: true,
            reason:
              `Error: tool "${name}" exceeded its unattended mutation threshold ` +
              `(${mutationThreshold} calls per run). Remaining calls require user approval.`,
          };
        }
      }
    }

    // HITL approval.
    if (needsApproval(name) || thresholdApproval) {
      if (hitlInterrupt) {
        let args = ctx.toolCall?.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        throw new HitlInterruptError(
          {
            id: ctx.toolCall?.id,
            name,
            arguments: args || {},
          },
          [{ actionName: name, allowedDecisions: ['approve', 'reject'] }],
        );
      }
      if (typeof requestApproval === 'function') {
        const approved = await requestApproval(ctx.toolCall);
        if (!approved) {
          return { block: true, reason: 'Tool call declined by the user.' };
        }
      }
    }

    return undefined;
  };
}

/**
 * Build a `transformContext` that performs summarization-based compaction when
 * the conversation approaches the model context window. Falls back to the
 * original messages on any error (the loop contract forbids throwing here).
 */
function buildCompaction(core, resolvedModel, apiKey, onChunk) {
  const settings = core.DEFAULT_COMPACTION_SETTINGS;
  return async function transformContext(messages, signal) {
    try {
      const window = resolvedModel && resolvedModel.contextWindow ? resolvedModel.contextWindow : 0;
      if (!window) return messages;
      const estimate = core.estimateContextTokens(messages);
      if (!core.shouldCompact(estimate.tokens, window, settings)) return messages;
      const tokensBefore = estimate.tokens;

      // Walk back from the end keeping roughly `keepRecentTokens`.
      let acc = 0;
      let cut = 0;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        acc += core.estimateTokens(messages[i]);
        if (acc > settings.keepRecentTokens) {
          cut = i + 1;
          break;
        }
      }
      if (cut <= 0) return messages;

      const toSummarize = messages.slice(0, cut);
      const recent = messages.slice(cut);
      const result = await core.generateSummary(
        toSummarize,
        resolvedModel,
        settings.reserveTokens,
        apiKey || '',
        undefined,
        signal,
      );
      const summary =
        typeof result === 'string'
          ? result
          : result && result.ok && typeof result.value === 'string'
            ? result.value
            : '';
      if (!summary) return messages;

      const summaryMessage = {
        role: 'user',
        content: [{ type: 'text', text: `[Conversation summary]\n${summary}` }],
        timestamp: Date.now(),
      };
      const compacted = [summaryMessage, ...recent];
      const tokensAfter = core.estimateContextTokens(compacted).tokens;
      emitCompactionChunk(onChunk, {
        tokensBefore,
        tokensAfter,
        summaryPreview: summary.slice(0, 280),
        automatic: true,
      });
      return compacted;
    } catch (err) {
      console.error('[AgentRuntime] compaction skipped:', err && err.message ? err.message : err);
      return messages;
    }
  };
}

/** Build a `shouldStopAfterTurn` that bounds the run to `limit` turns. */
function buildTurnLimiter(limit) {
  let turns = 0;
  return function shouldStopAfterTurn() {
    turns += 1;
    return turns >= limit;
  };
}

/** Run any agent surface through the Dome-native `@dome/agent-core` loop. */
async function runAgent(surface, opts) {
  return runDomeAgent(surface, opts);
}

/** Run the Many surface. Thin wrapper kept for existing callers. */
function runManyAgent(opts) {
  return runAgent('many', opts);
}

/** Build a harness `tool_call` hook from caps + HITL opts (needs live session messages). */
function buildHarnessToolCallHook(session, opts) {
  const before = buildBeforeToolCall(opts);
  return async function harnessToolCall(event) {
    const sessionCtx = await session.buildContext();
    const result = await before({
      toolCall: {
        id: event.toolCallId,
        name: event.toolName,
        arguments: event.input,
      },
      context: { messages: sessionCtx.messages },
    });
    if (result?.block) return { block: true, reason: result.reason };
    return undefined;
  };
}

/** Build a harness `context` hook that runs summarization-based compaction. */
function buildHarnessContextHook(core, resolvedModel, apiKey, onChunk) {
  const transform = buildCompaction(core, resolvedModel, apiKey, onChunk);
  return async function harnessContext(event) {
    const next = await transform(event.messages);
    return { messages: next };
  };
}

function parseToolArgs(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

function buildInterruptPayload(toolCall, reviewConfigs, threadId) {
  const args = parseToolArgs(toolCall?.arguments);
  const actionRequests = [{
    name: toolCall.name,
    args,
    description: `Approve tool call: ${toolCall.name}`,
  }];
  return {
    __interrupt__: true,
    threadId,
    actionRequests,
    reviewConfigs: reviewConfigs || [{ actionName: toolCall.name, allowedDecisions: ['approve', 'reject'] }],
    pendingToolCall: {
      id: toolCall.id || `hitl_${Date.now()}`,
      name: toolCall.name,
      arguments: args,
    },
  };
}

async function setupHarness(surface, opts) {
  const core = await import('@dome/agent-core');
  const ai = await import('@dome/ai');
  const { NodeExecutionEnv } = await import('@dome/agent-core/node');
  const bridge = require('./dome-harness-bridge.cjs');
  const database = require('../core/database.cjs');
  const dispatcher = require('../tools/tool-dispatcher.cjs');

  const {
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    onChunk,
    signal,
    thinkingLevel,
    threadId: rawThreadId,
    sessionId,
  } = opts;

  const effectiveThreadId =
    rawThreadId || (sessionId ? `session_${sessionId}` : undefined);

  const sysMsg = Array.isArray(messages) ? messages.find((m) => m && m.role === 'system') : null;
  const baseSystemPrompt =
    typeof sysMsg?.content === 'string'
      ? sysMsg.content
      : sysMsg
        ? JSON.stringify(sysMsg.content ?? '')
        : '';
  const nonSystem = (Array.isArray(messages) ? messages : []).filter((m) => m && m.role !== 'system');

  const { normalizeMessagesForProvider } = require('../ai/message-multimodal.cjs');
  const normalizedNonSystem = normalizeMessagesForProvider(nonSystem, { provider, modelId: model });

  let resolvedModel = ai.resolveDomeModel({ provider, model, baseUrl });
  if (baseUrl && resolvedModel && resolvedModel.baseUrl !== baseUrl) {
    resolvedModel = { ...resolvedModel, baseUrl };
  }
  const contextMessages = ai.legacyMessagesToContext(baseSystemPrompt, normalizedNonSystem).messages;

  const { session, threadId } = await bridge.resolveSession(effectiveThreadId, {
    parentThreadId: opts.parentThreadId,
    parentSessionPath: opts.parentSessionPath,
  });
  await bridge.seedSessionIfEmpty(session, contextMessages);

  const executeToolInMain = (name, args, contextOverride) =>
    dispatcher.executeToolInMain(name, args, {
      ...(opts.runtimeContext || {}),
      ownerType: opts.ownerType ?? null,
      surface,
      skipHitl: !!opts.skipHitl,
      automationProjectId: opts.automationProjectId ?? null,
      automationId: opts.automationId ?? null,
      ...(contextOverride || {}),
    });
  const mcpToolsList = await bridge.buildMcpAgentTools(database, opts.mcpServerIds);
  const mcpToolNames = mcpToolsList.map((t) => t.name);
  const tools = await bridge.buildAllTools(database, opts, executeToolInMain);
  const subagentToolNames = ['task', 'delegate_to_agent'];

  if (surface === 'many') {
    const { manySubagentIds, buildTaskTool } = require('./subagents-native.cjs');
    const enabledSubagents = Array.isArray(opts.subagentIds)
      ? opts.subagentIds
      : manySubagentIds();
    if (enabledSubagents.length > 0) {
      tools.push(buildTaskTool({
        provider,
        model,
        apiKey,
        baseUrl,
        runtimeContext: opts.runtimeContext,
        onChunk: opts.onChunk,
        signal: opts.signal,
        threadId,
        subagentIds: enabledSubagents,
        runAgent: (nestedSurface, nestedOpts) => runAgent(nestedSurface, nestedOpts),
      }));
    }
  }

  if (surface === 'agent-team' && Array.isArray(opts.teamMemberAgents) && opts.teamMemberAgents.length > 0) {
    const { buildDelegateToAgentTool } = require('./subagents-native.cjs');
    tools.push(buildDelegateToAgentTool({
      provider,
      model,
      apiKey,
      baseUrl,
      runtimeContext: opts.runtimeContext,
      onChunk: opts.onChunk,
      signal: opts.signal,
      threadId,
      mcpServerIds: opts.mcpServerIds,
      runAgent: (nestedSurface, nestedOpts) => runAgent(nestedSurface, nestedOpts),
    }, opts.teamMemberAgents));
  }

  const nativeWeb = ai.resolveNativeWebActivation(resolvedModel, tools);
  const activeTools =
    nativeWeb.search || nativeWeb.fetch ? ai.filterClientWebTools(tools, nativeWeb) : tools;

  const resources = await bridge.loadSkillsResources();
  const env = new NodeExecutionEnv({ cwd: process.cwd() });
  const harness = new core.AgentHarness({
    env,
    session,
    tools: activeTools,
    resources,
    model: resolvedModel,
    thinkingLevel: thinkingLevel && thinkingLevel !== 'off' ? thinkingLevel : 'off',
    streamOptions: {
      nativeWeb: nativeWeb.search || nativeWeb.fetch ? nativeWeb : undefined,
    },
    getApiKeyAndHeaders: async () => {
      if (!apiKey) return undefined;
      if (provider === 'copilot' || resolvedModel.provider === 'github-copilot') {
        const { COPILOT_HEADERS } = require('../auth/github-copilot-oauth.cjs');
        return { apiKey, headers: { ...COPILOT_HEADERS, ...(resolvedModel.headers || {}) } };
      }
      return { apiKey, headers: resolvedModel.headers };
    },
    shouldStopAfterTurn: buildTurnLimiter(recursionLimit()),
    systemPrompt: async (ctx) => {
      const skillsBlock = core.formatSkillsForSystemPrompt(ctx.resources.skills ?? []);
      if (!baseSystemPrompt) return skillsBlock || 'You are a helpful assistant.';
      if (!skillsBlock) return baseSystemPrompt;
      return `${baseSystemPrompt}\n\n${skillsBlock}`;
    },
  });

  const unsubTool = harness.on('tool_call', buildHarnessToolCallHook(session, opts));
  const unsubCtx = harness.on('context', buildHarnessContextHook(core, resolvedModel, apiKey, onChunk));
  const unsubEvents = harness.subscribe((event) => {
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'session_compact' && event.compactionEntry) {
      const entry = event.compactionEntry;
      emitCompactionChunk(onChunk, {
        tokensBefore: entry.tokensBefore ?? 0,
        tokensAfter: null,
        summaryPreview: typeof entry.summary === 'string' ? entry.summary.slice(0, 280) : '',
        automatic: false,
      });
      return;
    }
    if (event.type === 'agent_start') {
      if (typeof onChunk === 'function') {
        onChunk({ type: 'harness', event: 'agent_start' });
      }
      return;
    }
    if (event.type === 'agent_end' || event.type === 'message_update' || event.type === 'tool_execution_start' ||
        event.type === 'tool_execution_end' || event.type === 'tool_execution_update' ||
        event.type === 'turn_start' || event.type === 'turn_end' || event.type === 'message_end') {
      const chunk = mapAgentEventToChunk(event);
      if (chunk && typeof onChunk === 'function') onChunk(chunk);
    }
  });

  let abortListener = null;
  if (signal) {
    if (signal.aborted) {
      unsubTool();
      unsubCtx();
      unsubEvents();
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    abortListener = () => {
      void harness.abort();
    };
    signal.addEventListener('abort', abortListener, { once: true });
  }

  return {
    core,
    harness,
    session,
    threadId,
    resolvedModel,
    baseSystemPrompt,
    tools,
    resources,
    mcpToolNames,
    subagentToolNames,
    cleanup: () => {
      if (abortListener && signal) signal.removeEventListener('abort', abortListener);
      unsubTool();
      unsubCtx();
      unsubEvents();
    },
    executeToolInMain,
  };
}

/**
 * Resume a HITL-interrupted run: apply user decisions, append tool results, continue loop.
 */
async function resumeDomeAgent(surface, opts) {
  const {
    threadId,
    decisions,
    pendingApproval,
    onChunk,
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    signal,
  } = opts;

  const actionRequests = pendingApproval?.actionRequests || [];
  const pendingToolCall = opts.pendingToolCall || (actionRequests[0]
    ? {
        id: `hitl_${Date.now()}`,
        name: actionRequests[0].name,
        arguments: actionRequests[0].args || {},
      }
    : null);

  if (!pendingToolCall?.name) {
    throw new Error('No pending tool call to resume');
  }

  const setup = await setupHarness(surface, {
    ...opts,
    provider,
    model,
    apiKey,
    baseUrl,
    messages: messages || [{ role: 'user', content: 'Continue after approval.' }],
    threadId,
    hitlInterrupt: false,
    skipHitl: true,
  });

  const { harness, session, resolvedModel, cleanup, executeToolInMain } = setup;
  const toolCallId = pendingToolCall.id || `hitl_${Date.now()}`;
  const toolName = pendingToolCall.name;
  const toolArgs = parseToolArgs(pendingToolCall.arguments);

  const decision = Array.isArray(decisions) ? decisions[0] : null;
  const approved = decision?.type === 'approve' || decision?.type === 'edit';

  try {
    await session.appendMessage({
      role: 'assistant',
      content: [{
        type: 'toolCall',
        id: toolCallId,
        name: toolName,
        arguments: decision?.type === 'edit' && decision.editedAction
          ? decision.editedAction.args
          : toolArgs,
      }],
      api: resolvedModel.api,
      provider: resolvedModel.provider,
      model: resolvedModel.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: Date.now(),
    });

    const effectiveArgs = decision?.type === 'edit' && decision.editedAction
      ? decision.editedAction.args
      : toolArgs;

    let resultText;
    let isError = false;
    if (approved) {
      try {
        // The user already approved this exact call via the HITL card — tool
        // handlers with their own approval dialog (e.g. shell_exec) must not ask again.
        const raw = await executeToolInMain(toolName, effectiveArgs, { hitlApproved: true });
        resultText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
      } catch (err) {
        isError = true;
        resultText = err instanceof Error ? err.message : String(err);
      }
    } else {
      isError = true;
      resultText = decision?.message || 'Tool call declined by the user.';
    }

    await session.appendMessage({
      role: 'toolResult',
      toolCallId,
      toolName,
      content: [{ type: 'text', text: resultText }],
      isError,
      timestamp: Date.now(),
    });

    if (typeof onChunk === 'function') {
      onChunk({
        type: 'tool_result',
        toolCallId,
        result: resultText,
      });
    }

    const assistant = await harness.continueTurn();
    const finalText = assistantText(assistant);
    if (assistant?.stopReason === 'error') {
      const errText = finalText || assistant.errorMessage || 'Agent error';
      if (typeof onChunk === 'function') onChunk({ type: 'error', error: errText });
      throw new Error(errText);
    }
    if (typeof onChunk === 'function') onChunk({ type: 'done' });
    return finalText;
  } catch (err) {
    if (err instanceof HitlInterruptError) {
      const payload = buildInterruptPayload(err.toolCall, err.reviewConfigs, setup.threadId);
      if (typeof onChunk === 'function') {
        onChunk({
          type: 'interrupt',
          actionRequests: payload.actionRequests,
          reviewConfigs: payload.reviewConfigs,
          threadId: payload.threadId,
          pendingToolCall: payload.pendingToolCall,
        });
      }
      return payload;
    }
    console.error('[AgentRuntime] resume failed:', err?.message || err);
    if (typeof onChunk === 'function' && err?.message) {
      onChunk({ type: 'error', error: err.message });
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Dome-native path. Drives `AgentHarness` (JSONL session + skills + compaction) and
 * relays agent events to `onChunk` via `mapAgentEventToChunk`.
 */
/** Open an idle harness on an existing JSONL session (compact / branch summary IPC). */
async function openHarnessForThread(opts) {
  return setupHarness('threads', {
    ...opts,
    skipHitl: true,
    hitlInterrupt: false,
    messages: opts.messages ?? [{ role: 'system', content: '' }],
    onChunk: undefined,
    signal: undefined,
  });
}

async function runDomeAgent(surface, opts) {
  console.log(`[AgentRuntime] ⚡ Dome-native AgentHarness — ${surface}`);
  const ai = await import('@dome/ai');
  const rawNonSystem = (Array.isArray(opts.messages) ? opts.messages : []).filter(
    (m) => m && m.role !== 'system',
  );
  const { normalizeMessagesForProvider } = require('../ai/message-multimodal.cjs');
  const { attachmentsToImageContent } = require('../ai/image-attach.cjs');
  const normalizedNonSystem = normalizeMessagesForProvider(rawNonSystem, {
    provider: opts.provider,
    modelId: opts.model,
  });
  const contextMessages = ai.legacyMessagesToContext('', normalizedNonSystem).messages;
  let userPrompt = lastUserText(contextMessages);
  const lastRaw = lastRawUserMessage(rawNonSystem);
  const promptImages = await attachmentsToImageContent(lastRaw?.attachments, {
    provider: opts.provider,
    modelId: opts.model,
  });
  if (!userPrompt.trim() && promptImages.length > 0) {
    userPrompt = '(see attached image)';
  }

  if (process.env.DOME_GUARDRAILS === '1') {
    const reason = detectHarmfulContent(userPrompt);
    if (reason) {
      if (typeof opts.onChunk === 'function') {
        opts.onChunk({ type: 'text', text: reason });
        opts.onChunk({ type: 'done' });
      }
      return reason;
    }
  }

  const setup = await setupHarness(surface, opts);
  const { harness, threadId, cleanup } = setup;

  try {
    if (typeof opts.onChunk === 'function') {
      try {
        const breakdown = await buildBudgetBreakdown(setup, {
          userMemory: opts.userMemory,
        });
        emitBudgetChunk(opts.onChunk, breakdown);
      } catch (budgetErr) {
        console.warn('[AgentRuntime] budget telemetry skipped:', budgetErr?.message || budgetErr);
      }
    }
    const assistant = await harness.prompt(
      userPrompt,
      promptImages.length > 0 ? { images: promptImages } : undefined,
    );
    const finalText = assistantText(assistant);
    if (assistant?.stopReason === 'error') {
      const errText = finalText || assistant.errorMessage || 'Agent error';
      if (typeof opts.onChunk === 'function') {
        opts.onChunk({ type: 'error', error: errText });
      }
      throw new Error(errText);
    }
    return finalText;
  } catch (err) {
    if (err instanceof HitlInterruptError) {
      const payload = buildInterruptPayload(err.toolCall, err.reviewConfigs, threadId);
      if (typeof opts.onChunk === 'function') {
        opts.onChunk({
          type: 'interrupt',
          actionRequests: payload.actionRequests,
          reviewConfigs: payload.reviewConfigs,
          threadId: payload.threadId,
          pendingToolCall: payload.pendingToolCall,
        });
      }
      return payload;
    }
    const aborted = opts.signal?.aborted
      || err?.name === 'AbortError'
      || `${err?.message || ''}`.toLowerCase().includes('terminated')
      || `${err?.message || ''}`.toLowerCase().includes('abort');
    if (aborted) {
      console.log('[AgentRuntime] run cancelled:', err?.message || 'aborted');
    } else {
      console.error('[AgentRuntime] run failed:', err?.message || err);
    }
    if (typeof opts.onChunk === 'function' && err?.message && !aborted) {
      opts.onChunk({ type: 'error', error: err.message });
    }
    if (aborted) {
      const abortErr = new Error('Run cancelled');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw err;
  } finally {
    cleanup();
  }
}

module.exports = {
  resolveRuntime,
  mapAgentEventToChunk,
  buildBudgetBreakdown,
  emitBudgetChunk,
  emitCompactionChunk,
  runAgent,
  runManyAgent,
  runDomeAgent,
  resumeDomeAgent,
  openHarnessForThread,
  HitlInterruptError,
  HITL_TOOL_NAMES,
  // exported for tests
  detectHarmfulContent,
  countPriorToolCalls,
  countAllPriorToolCalls,
  buildBeforeToolCall,
  CREATION_TOOL_CAPS,
  MUTATION_HITL_THRESHOLDS,
  DEFAULT_GLOBAL_TOOL_CALL_LIMIT,
  DEFAULT_PER_TOOL_CAP,
};
