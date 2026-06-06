#!/usr/bin/env node
/* eslint-disable */
/**
 * Dome-native agent runtime — headless validation CLI.
 *
 * Drives the REAL new runtime end-to-end OUTSIDE Electron:
 *   @dome/agent-core (runAgentLoop + hooks)  ──┐
 *   @dome/tools      (createToolRegistry)    ──┤→ legacy onChunk stream (printed)
 *   electron/tool-dispatcher.cjs (REAL exec) ──┘
 *   electron/agent-runtime.cjs (event → chunk mapping, StreamFn adapter)
 *
 * Modes:
 *   --mock   (default)  deterministic scripted "model" — no LLM, no network.
 *                       Proves the full pipeline: stream-parse → tool exec
 *                       (REAL dispatcher) → hooks → chunk mapping.
 *   --provider <p> --model <m>   real LLM via the StreamFn adapter (needs an
 *                       API key in env, e.g. OPENAI_API_KEY). Validates the
 *                       one piece unit tests can't: live LangChain streaming.
 *
 * Flags:
 *   --stub-tools        don't touch the real dispatcher (pure pipeline).
 *   --prompt "<text>"   user prompt (real mode).
 *   --tool <name>       which real tool the mock model calls (default get_tool_definition).
 *
 * Examples:
 *   node scripts/dome-agent-cli.mjs --mock
 *   node scripts/dome-agent-cli.mjs --mock --stub-tools
 *   OPENAI_API_KEY=sk-... node scripts/dome-agent-cli.mjs --provider openai --model gpt-4o-mini --prompt "List 2 facts about the moon"
 */
'use strict';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import * as core from '../packages/agent-core/dist/index.js';
import * as toolsPkg from '../packages/tools/dist/index.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const MOCK = !has('--provider');
const STUB_TOOLS = has('--stub-tools');
const PROMPT = val('--prompt', 'Show me the definition of a tool.');
const MOCK_TOOL = val('--tool', 'get_tool_definition');

function banner(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

// ── tools: real dispatcher or stub ──────────────────────────────────────────
function buildExecuteToolInMain() {
  if (STUB_TOOLS) {
    return async (name, args) => ({ stubbed: true, name, args });
  }
  const dispatcher = require('../electron/tools/tool-dispatcher.cjs');
  return (name, args) => dispatcher.executeToolInMain(name, args, {});
}

function buildToolDefinitions() {
  if (STUB_TOOLS) {
    // Minimal defs covering the mock tool.
    return [{ type: 'function', function: { name: MOCK_TOOL, description: '', parameters: { type: 'object', properties: {} } } }];
  }
  // Real catalog (103 tools) from the dispatcher.
  const dispatcher = require('../electron/tools/tool-dispatcher.cjs');
  return dispatcher.getAllToolDefinitions();
}

// ── StreamFn: mock (scripted) or real (LangChain adapter) ────────────────────
async function* mockStream(req) {
  // Decide turn by whether a tool result is already in history.
  const hasToolResult = req.messages.some((m) => m.role === 'tool');
  if (!hasToolResult) {
    yield { type: 'text', text: `Let me look that up via ${MOCK_TOOL}…\n` };
    yield {
      type: 'tool_call',
      toolCall: { id: 'call_1', name: MOCK_TOOL, arguments: { tool_name: 'web_search', name: 'web_search' } },
    };
    yield { type: 'usage', usage: { inputTokens: 42, outputTokens: 9, totalTokens: 51 } };
    yield { type: 'done', message: { text: '', usage: { inputTokens: 42, outputTokens: 9, totalTokens: 51 }, toolCalls: [{ id: 'call_1', name: MOCK_TOOL, arguments: { tool_name: 'web_search' } }] } };
  } else {
    yield { type: 'text', text: 'Done — the tool returned its result above.' };
    yield { type: 'done', message: { text: 'Done — the tool returned its result above.', usage: null } };
  }
}

function buildStreamFn(provider, model) {
  if (MOCK) return mockStream;
  const agentRuntime = require('../electron/agents/agent-runtime.cjs');
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    undefined;
  return agentRuntime.createStreamFnAdapter({ provider, model, apiKey, baseUrl: undefined });
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  const agentRuntime = require('../electron/agents/agent-runtime.cjs');
  const provider = val('--provider', 'openai');
  const model = val('--model', 'gpt-4o-mini');

  banner(`Dome agent CLI — mode=${MOCK ? 'MOCK model' : `REAL ${provider}/${model}`}, tools=${STUB_TOOLS ? 'STUB' : 'REAL dispatcher'}`);

  const executeToolInMain = buildExecuteToolInMain();
  const definitions = buildToolDefinitions();
  const tools = toolsPkg.createToolRegistry(definitions, { executeToolInMain });
  console.log(`Registered ${tools.length} tools (via @dome/tools.createToolRegistry).`);

  const hooks = core.buildDefaultHooks({ guardrails: true });

  const state = {
    systemPrompt: 'You are Many, a Dome assistant. Be concise.',
    model: { provider, model },
    thinkingLevel: 'off',
    tools,
    messages: [{ role: 'user', content: PROMPT }],
  };
  const config = {
    streamFn: buildStreamFn(provider, model),
    hooks,
    compaction: core.createDefaultCompaction(),
    recursionLimit: 8,
  };

  banner('── legacy onChunk stream (what the renderer receives) ──');
  const counts = {};
  let finalText = '';
  for await (const event of core.runAgentLoop(state, config)) {
    if (event.type === 'text_delta') finalText += event.text;
    const chunk = agentRuntime.mapAgentEventToChunk(event);
    if (!chunk) continue;
    counts[chunk.type] = (counts[chunk.type] || 0) + 1;
    if (chunk.type === 'text') process.stdout.write(`\x1b[36m${chunk.text}\x1b[0m`);
    else if (chunk.type === 'tool_call') console.log(`\n\x1b[33m[tool_call]\x1b[0m ${chunk.toolCall.name}(${chunk.toolCall.arguments})`);
    else if (chunk.type === 'tool_result') console.log(`\x1b[32m[tool_result]\x1b[0m ${String(chunk.result).slice(0, 240)}`);
    else if (chunk.type === 'usage') console.log(`\x1b[90m[usage]\x1b[0m ${JSON.stringify(chunk.usage)}`);
    else if (chunk.type === 'error') console.log(`\n\x1b[31m[error]\x1b[0m ${chunk.error}`);
    else if (chunk.type === 'done') console.log(`\n\x1b[90m[done]\x1b[0m`);
  }

  banner('── summary ──');
  console.log('chunk counts:', JSON.stringify(counts));
  console.log('final text:', JSON.stringify(finalText.slice(0, 200)));
  const ok = counts.done >= 1 && !('error' in counts && MOCK && !process.env.EXPECT_ERROR);
  console.log(ok ? '\x1b[32mPIPELINE OK\x1b[0m' : '\x1b[31mPIPELINE PROBLEM\x1b[0m');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('\x1b[31mCLI failed:\x1b[0m', e);
  process.exit(1);
});
