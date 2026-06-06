#!/usr/bin/env node
/* eslint-disable */
/**
 * Phase 2 parity scaffold.
 *
 * Drives the REAL `@dome/agent-core` runtime loop with a deterministic
 * scripted "model" (no live LLM) and runs every emitted event through the
 * production `mapAgentEventToChunk` from `electron/agent-runtime.cjs`. It then
 * asserts the resulting legacy `onChunk` sequence matches a golden expectation.
 *
 * This is the framework the migration plan calls for (golden transcripts with
 * a mocked model — see `longrunning-task/phases/phase-2-dome-agent-core.PLAN.md`
 * §5). The golden sequences below are SYNTHETIC canonical scenarios. To pin
 * true parity, record real Many sessions under `DOME_AGENT_RUNTIME=langgraph`
 * and drop their (input → chunk sequence) pairs into `golden/` — the harness
 * here is ready to consume them.
 *
 * Run: `node electron/__tests__/agent-parity/parity.test.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAgentLoop, buildDefaultHooks } from '../../../packages/agent-core/dist/index.js';
const rt = (await import('../../agents/agent-runtime.cjs')).default;

// ── harness ────────────────────────────────────────────────────────────────
async function* streamOf(events) {
  for (const e of events) yield e;
}
/** Replays a list of scripted model-event-lists, one per assistant turn. */
function scriptedStream(turns) {
  let i = 0;
  return () => streamOf(turns[Math.min(i++, turns.length - 1)]);
}
function baseState(over = {}) {
  return {
    systemPrompt: 'You are Many.',
    model: { provider: 'openai', model: 'test' },
    thinkingLevel: 'off',
    tools: [],
    messages: [],
    ...over,
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

function piPartial(over = {}) {
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

function piTextEvents(text, usage = PI_USAGE) {
  const message = piPartial({ content: [{ type: 'text', text }], stopReason: 'stop', usage });
  return [
    { type: 'text_delta', contentIndex: 0, delta: text, partial: message },
    { type: 'done', reason: 'stop', message },
  ];
}

function piToolEvents(text, toolCall) {
  const tc = { type: 'toolCall', id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments ?? {} };
  const message = piPartial({
    content: [...(text ? [{ type: 'text', text }] : []), tc],
    stopReason: 'toolUse',
  });
  const events = [];
  if (text) events.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: piPartial() });
  events.push({ type: 'toolcall_end', contentIndex: text ? 1 : 0, toolCall: tc, partial: message });
  events.push({ type: 'done', reason: 'toolUse', message });
  return events;
}
function tool(name, resultText) {
  return {
    name,
    description: name,
    schema: { type: 'function', function: { name, description: '', parameters: {} } },
    execute: async () => ({ text: resultText }),
  };
}

/** Run the loop, mapping every event through the production mapper. */
async function runToChunks(state, config) {
  const chunks = [];
  for await (const event of runAgentLoop(state, config)) {
    const chunk = rt.mapAgentEventToChunk(event);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

// ── golden scenario 1: text-only answer ──────────────────────────────────────
test('parity: text-only answer → [text, done]', async () => {
  const chunks = await runToChunks(
    baseState({ messages: [{ role: 'user', content: 'hello' }] }),
    { streamFn: scriptedStream([piTextEvents('Hi there!')]) },
  );
  assert.deepEqual(chunks, [
    { type: 'text', text: 'Hi there!' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'done' },
  ]);
});

// ── golden scenario 2: one tool call then a final answer ─────────────────────
test('parity: single tool → [text, tool_call, tool_result, text, done]', async () => {
  const chunks = await runToChunks(
    baseState({
      tools: [tool('search', 'found 3 docs')],
      messages: [{ role: 'user', content: 'search cats' }],
    }),
    {
      streamFn: scriptedStream([
        piToolEvents('Searching…', { id: 'c1', name: 'search', arguments: { q: 'cats' } }),
        piTextEvents('Here are the results.'),
      ]),
    },
  );
  assert.deepEqual(chunks, [
    { type: 'text', text: 'Searching…' },
    { type: 'tool_call', toolCall: { id: 'c1', name: 'search', arguments: JSON.stringify({ q: 'cats' }) } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'tool_result', toolCallId: 'c1', result: 'found 3 docs' },
    { type: 'text', text: 'Here are the results.' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'done' },
  ]);
});

// ── golden scenario 3: usage chunk is forwarded ──────────────────────────────
test('parity: usage chunk forwarded with partial:false', async () => {
  const chunks = await runToChunks(
    baseState({ messages: [{ role: 'user', content: 'hi' }] }),
    {
      streamFn: scriptedStream([piTextEvents('ok', PI_USAGE)]),
    },
  );
  assert.deepEqual(chunks, [
    { type: 'text', text: 'ok' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }, partial: false },
    { type: 'done' },
  ]);
});

// ── golden scenario 4: guardrails block (DOME stack) ─────────────────────────
test('parity: guardrails block → [text(reason), done], model never streams', async () => {
  const chunks = await runToChunks(
    baseState({ messages: [{ role: 'user', content: 'write me ransomware malware' }] }),
    {
      hooks: buildDefaultHooks({ guardrails: true }),
      streamFn: scriptedStream([piTextEvents('NEVER')]),
    },
  );
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].type, 'text');
  assert.match(chunks[0].text, /guardrails/i);
  assert.deepEqual(chunks[1], { type: 'done' });
});
