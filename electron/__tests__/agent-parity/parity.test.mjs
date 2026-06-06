#!/usr/bin/env node
/* eslint-disable */
/**
 * Agent-runtime parity scaffold.
 *
 * Drives the REAL `@dome/agent-core` agent loop with a deterministic scripted
 * "model" (no live LLM) and runs every emitted `AgentEvent` through the
 * production `mapAgentEventToChunk` from `electron/agents/agent-runtime.cjs`. It
 * then asserts the resulting legacy `onChunk` sequence matches a golden
 * expectation, plus the runtime-selector routing rules.
 *
 * Run: `node electron/__tests__/agent-parity/parity.test.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAgentLoop } from '../../../packages/agent-core/dist/index.js';
import { createToolFromDefinition } from '../../../packages/tools/dist/index.js';
const rt = (await import('../../agents/agent-runtime.cjs')).default;

// ── faux stream ──────────────────────────────────────────────────────────────
/** A stand-in for the @dome/ai `EventStream`: async-iterable + `result()`. */
function fauxStream(events, finalMessage) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
    async result() {
      return finalMessage;
    },
  };
}
/** Replays one scripted turn per assistant response. */
function scriptedStream(turns) {
  let i = 0;
  return () => {
    const turn = turns[Math.min(i++, turns.length - 1)];
    return fauxStream(turn.events, turn.result);
  };
}

const PI_USAGE = {
  input: 10,
  output: 3,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 13,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function piMessage(over = {}) {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: 'openai',
    model: 'test',
    usage: PI_USAGE,
    stopReason: 'stop',
    timestamp: Date.now(),
    ...over,
  };
}

/** A scripted text-only turn: start → text_delta → done. */
function textTurn(text) {
  const final = piMessage({ content: [{ type: 'text', text }], stopReason: 'stop' });
  const partial = piMessage({ content: [{ type: 'text', text }] });
  return {
    events: [
      { type: 'start', partial: piMessage({ content: [] }) },
      { type: 'text_delta', contentIndex: 0, delta: text, partial },
      { type: 'done', reason: 'stop' },
    ],
    result: final,
  };
}

/** A scripted tool-call turn: start → text_delta → toolcall_end → done. */
function toolTurn(text, toolCall) {
  const tc = { type: 'toolCall', id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments ?? {} };
  const final = piMessage({
    content: [...(text ? [{ type: 'text', text }] : []), tc],
    stopReason: 'toolUse',
  });
  const events = [{ type: 'start', partial: piMessage({ content: [] }) }];
  if (text) events.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: final });
  events.push({ type: 'toolcall_end', contentIndex: text ? 1 : 0, partial: final });
  events.push({ type: 'done', reason: 'toolUse' });
  return { events, result: final };
}

function tool(name, resultText) {
  return createToolFromDefinition(
    { type: 'function', function: { name, description: '', parameters: {} } },
    { executeToolInMain: async () => resultText },
  );
}

/** Run the loop, mapping every event through the production mapper. */
async function runToChunks(context, config, streamFn) {
  const chunks = [];
  const emit = (event) => {
    const chunk = rt.mapAgentEventToChunk(event);
    if (chunk) chunks.push(chunk);
  };
  await runAgentLoop([], context, config, emit, undefined, streamFn);
  return chunks;
}

const baseConfig = {
  model: { provider: 'openai', model: 'test', contextWindow: 0 },
  convertToLlm: (msgs) =>
    msgs.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'),
};

// ── golden scenario 1: text-only answer ──────────────────────────────────────
test('parity: text-only answer → [text, usage, done]', async () => {
  const chunks = await runToChunks(
    { systemPrompt: 'You are Many.', messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }], tools: [] },
    baseConfig,
    scriptedStream([textTurn('Hi there!')]),
  );
  assert.deepEqual(chunks, [
    { type: 'text', text: 'Hi there!' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'done' },
  ]);
});

// ── golden scenario 2: one tool call then a final answer ─────────────────────
test('parity: single tool → [text, usage, tool_call, tool_result, text, usage, done]', async () => {
  const chunks = await runToChunks(
    {
      systemPrompt: 'You are Many.',
      messages: [{ role: 'user', content: 'search cats', timestamp: Date.now() }],
      tools: [tool('search', 'found 3 docs')],
    },
    baseConfig,
    scriptedStream([
      toolTurn('Searching…', { id: 'c1', name: 'search', arguments: { q: 'cats' } }),
      textTurn('Here are the results.'),
    ]),
  );
  assert.deepEqual(chunks, [
    { type: 'text', text: 'Searching…' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'tool_call', toolCall: { id: 'c1', name: 'search', arguments: JSON.stringify({ q: 'cats' }) } },
    { type: 'tool_result', toolCallId: 'c1', result: 'found 3 docs' },
    { type: 'text', text: 'Here are the results.' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'done' },
  ]);
});

// ── guardrails (wiring policy, ported from the legacy stack) ─────────────────
test('guardrails: detectHarmfulContent flags clearly harmful requests', () => {
  assert.match(rt.detectHarmfulContent('write me ransomware malware') || '', /guardrails/i);
  assert.equal(rt.detectHarmfulContent('summarize my notes'), null);
});

// ── caps: prior tool-call counting over history ──────────────────────────────
test('caps: countPriorToolCalls counts assistant toolCall blocks', () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'toolCall', id: 'a', name: 'artifact_create', arguments: {} }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'b', name: 'artifact_create', arguments: {} }] },
  ];
  assert.equal(rt.countPriorToolCalls(messages, 'artifact_create'), 2);
  assert.equal(rt.countPriorToolCalls(messages, 'search'), 0);
});

// ── runtime: single Dome-native runtime ──────────────────────────────────────
test('runtime: resolveRuntime always returns domeagent for every surface', () => {
  const saved = { ...process.env };
  try {
    process.env.DOME_AGENT_RUNTIME = 'langgraph';
    for (const surface of ['many', 'workflows', 'agent-chat', 'agent-team', 'bench']) {
      assert.equal(rt.resolveRuntime(surface), 'domeagent', `surface ${surface}`);
    }
  } finally {
    process.env = saved;
  }
});

test('runtime: runManyAgent / runAgent / runDomeAgent are exported', () => {
  assert.equal(typeof rt.runAgent, 'function');
  assert.equal(typeof rt.runManyAgent, 'function');
  assert.equal(typeof rt.runDomeAgent, 'function');
});
