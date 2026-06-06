#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for @dome/agent-core runtime core (Tareas 6-8):
 *   - parseModelStream  (stream-parser, T7)
 *   - executeToolCalls  (tool-executor, T6)
 *   - runAgentLoop      (agent-loop, T8)
 *   - createAgent       (T8)
 *
 * Uses `node:test` + `node:assert/strict` (no vitest). Imports the compiled
 * output from `packages/agent-core/dist/` so it runs without re-invoking tsc
 * between writes (run `npx tsc -b packages/agent-core` first).
 *
 * The model is faked via an injected `StreamFn` that yields scripted
 * `AssistantMessageEvent`s, so no live LLM is involved.
 *
 * Invocation: `node scripts/test-agent-core-runtime.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseModelStream,
  executeToolCalls,
  runAgentLoop,
  createAgent,
} from '../packages/agent-core/dist/index.js';

// =============================================================================
// Helpers
// =============================================================================

/** Pi-style stream helpers for tests (matches @dome/ai wire format). */
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
  const message = piPartial({
    content: [{ type: 'text', text }],
    usage,
    stopReason: 'stop',
  });
  return [
    { type: 'start', partial: piPartial({ usage }) },
    { type: 'text_delta', contentIndex: 0, delta: text, partial: message },
    { type: 'done', reason: 'stop', message },
  ];
}

function piToolEvents(text, toolCall) {
  const tc = {
    type: 'toolCall',
    id: toolCall.id,
    name: toolCall.name,
    arguments: toolCall.arguments ?? {},
  };
  const message = piPartial({
    content: [...(text ? [{ type: 'text', text }] : []), tc],
    stopReason: 'toolUse',
  });
  const events = [];
  if (text) {
    events.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: piPartial() });
  }
  events.push({ type: 'toolcall_end', contentIndex: text ? 1 : 0, toolCall: tc, partial: message });
  events.push({ type: 'done', reason: 'toolUse', message });
  return events;
}

/** Build an async iterable from a fixed list of events. */
async function* streamOf(events) {
  for (const e of events) yield e;
}

/** A StreamFn that replays a fixed script of events, ignoring the request. */
function fixedStream(events) {
  return () => streamOf(events);
}

/**
 * A StreamFn that returns a different script on each successive call.
 * `scripts` is an array of event-lists; call N uses scripts[N].
 */
function scriptedStream(scripts) {
  let i = 0;
  return () => {
    const events = scripts[Math.min(i, scripts.length - 1)];
    i += 1;
    return streamOf(events);
  };
}

/** Drain an AsyncGenerator<AgentEvent> into an array. */
async function collect(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

function baseState(overrides = {}) {
  return {
    systemPrompt: 'You are a test agent.',
    model: { provider: 'openai', model: 'test-model' },
    thinkingLevel: 'off',
    tools: [],
    messages: [],
    ...overrides,
  };
}

/** Minimal AgentTool whose execute returns a fixed result. */
function echoTool(name, fn) {
  return {
    name,
    description: `echo ${name}`,
    schema: { type: 'function', function: { name, description: '', parameters: {} } },
    execute: fn,
  };
}

// =============================================================================
// T7 — parseModelStream
// =============================================================================

test('parseModelStream: text-only assembles message, emits text_delta', async () => {
  const events = [];
  const usage = { input: 5, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 7, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const res = await parseModelStream(
    streamOf([
      { type: 'start', partial: piPartial({ usage }) },
      { type: 'text_delta', contentIndex: 0, delta: 'Hello ', partial: piPartial() },
      { type: 'text_delta', contentIndex: 0, delta: 'world', partial: piPartial() },
      { type: 'done', reason: 'stop', message: piPartial({ content: [{ type: 'text', text: 'Hello world' }], usage }) },
    ]),
    (e) => events.push(e),
  );
  assert.equal(res.text, 'Hello world');
  assert.equal(res.toolCalls.length, 0);
  assert.equal(res.usage?.totalTokens, 7);
  assert.deepEqual(
    events.filter((e) => e.type === 'text_delta').map((e) => e.text),
    ['Hello ', 'world'],
  );
  assert.ok(events.some((e) => e.type === 'usage'));
});

test('parseModelStream: collects tool calls and emits tool_call events', async () => {
  const events = [];
  const tc = { type: 'toolCall', id: 'c1', name: 'search', arguments: { q: 'x' } };
  const res = await parseModelStream(
    streamOf([
      { type: 'text_delta', contentIndex: 0, delta: 'let me check', partial: piPartial() },
      { type: 'toolcall_end', contentIndex: 1, toolCall: tc, partial: piPartial({ content: [{ type: 'text', text: 'let me check' }, tc], stopReason: 'toolUse' }) },
      { type: 'done', reason: 'toolUse', message: piPartial({ content: [{ type: 'text', text: 'let me check' }, tc], stopReason: 'toolUse' }) },
    ]),
    (e) => events.push(e),
  );
  assert.equal(res.toolCalls.length, 1);
  assert.equal(res.toolCalls[0].name, 'search');
  assert.deepEqual(res.toolCalls[0].arguments, { q: 'x' });
  assert.ok(events.some((e) => e.type === 'tool_call' && e.call.id === 'c1'));
});

test('parseModelStream: prefers provider done.message but keeps tool calls', async () => {
  const tc = { type: 'toolCall', id: 'c1', name: 't', arguments: {} };
  const res = await parseModelStream(
    streamOf([
      { type: 'text_delta', contentIndex: 0, delta: 'partial', partial: piPartial() },
      { type: 'toolcall_end', contentIndex: 1, toolCall: tc, partial: piPartial() },
      { type: 'done', reason: 'toolUse', message: piPartial({ content: [{ type: 'text', text: 'final text' }, tc], stopReason: 'toolUse' }) },
    ]),
    () => {},
  );
  assert.equal(res.text, 'final text');
  assert.equal(res.toolCalls.length, 1);
});

test('parseModelStream: surfaces error and emits error event', async () => {
  const events = [];
  const errMsg = piPartial({ stopReason: 'error', errorMessage: 'boom', content: [] });
  const res = await parseModelStream(
    streamOf([{ type: 'error', reason: 'error', error: errMsg }]),
    (e) => events.push(e),
  );
  assert.equal(res.error, 'boom');
  assert.ok(events.some((e) => e.type === 'error'));
});

// =============================================================================
// T6 — executeToolCalls
// =============================================================================

const execOpts = (over = {}) => ({
  hooks: undefined,
  mode: 'sequential',
  makeContext: () => ({ threadId: 't', signal: new AbortController().signal, recursionDepth: 0 }),
  state: baseState(),
  threadId: 't',
  recursionDepth: 0,
  emit: () => {},
  ...over,
});

test('executeToolCalls: runs a tool and returns its result', async () => {
  const tool = echoTool('greet', async (args) => ({ text: `hi ${args.name}` }));
  const out = await executeToolCalls(
    [{ id: '1', name: 'greet', arguments: { name: 'Ada' } }],
    execOpts({ tools: [tool] }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].result.text, 'hi Ada');
  assert.equal(out[0].result.error, undefined);
});

test('executeToolCalls: missing tool yields tool_not_found error result', async () => {
  const out = await executeToolCalls(
    [{ id: '1', name: 'nope', arguments: {} }],
    execOpts({ tools: [] }),
  );
  assert.equal(out[0].result.error, 'tool_not_found');
});

test('executeToolCalls: a throwing tool becomes an error result (no throw)', async () => {
  const tool = echoTool('bad', async () => {
    throw new Error('kaboom');
  });
  const out = await executeToolCalls(
    [{ id: '1', name: 'bad', arguments: {} }],
    execOpts({ tools: [tool] }),
  );
  assert.match(out[0].result.error, /kaboom/);
});

test('executeToolCalls: beforeToolCall block prevents execution', async () => {
  let ran = false;
  const tool = echoTool('danger', async () => {
    ran = true;
    return { text: 'did it' };
  });
  const out = await executeToolCalls(
    [{ id: '1', name: 'danger', arguments: {} }],
    execOpts({
      tools: [tool],
      hooks: { beforeToolCall: async () => ({ block: true, reason: 'not allowed' }) },
    }),
  );
  assert.equal(ran, false);
  assert.equal(out[0].result.error, 'not allowed');
  assert.equal(out[0].result.text, 'not allowed');
});

test('executeToolCalls: afterToolCall can mutate result and set terminate', async () => {
  const tool = echoTool('t', async () => ({ text: 'raw' }));
  const out = await executeToolCalls(
    [{ id: '1', name: 't', arguments: {} }],
    execOpts({
      tools: [tool],
      hooks: { afterToolCall: async () => ({ text: 'patched', terminate: true }) },
    }),
  );
  assert.equal(out[0].result.text, 'patched');
  assert.equal(out[0].result.terminate, true);
});

test('executeToolCalls: parallel mode preserves call order in results', async () => {
  const slow = echoTool('slow', async () => {
    await new Promise((r) => setTimeout(r, 30));
    return { text: 'slow-done' };
  });
  const fast = echoTool('fast', async () => ({ text: 'fast-done' }));
  const out = await executeToolCalls(
    [
      { id: '1', name: 'slow', arguments: {} },
      { id: '2', name: 'fast', arguments: {} },
    ],
    execOpts({ tools: [slow, fast], mode: 'parallel' }),
  );
  assert.deepEqual(out.map((o) => o.call.name), ['slow', 'fast']);
  assert.equal(out[0].result.text, 'slow-done');
});

// =============================================================================
// T8 — runAgentLoop
// =============================================================================

test('runAgentLoop: missing streamFn yields a clear error', async () => {
  const events = await collect(runAgentLoop(baseState(), {}));
  assert.ok(events.some((e) => e.type === 'error' && /streamFn/.test(e.error)));
  assert.equal(events[events.length - 1].type, 'done');
});

test('runAgentLoop: text-only turn → turn_start, text_delta, turn_end, done', async () => {
  const events = await collect(
    runAgentLoop(baseState(), {
      streamFn: fixedStream(piTextEvents('final answer')),
    }),
  );
  const types = events.map((e) => e.type);
  assert.equal(types[0], 'turn_start');
  assert.ok(types.includes('text_delta'));
  assert.ok(types.includes('turn_end'));
  assert.equal(types[types.length - 1], 'done');
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.finalMessage.text, 'final answer');
});

test('runAgentLoop: single tool turn then final answer', async () => {
  const tool = echoTool('search', async (args) => ({ text: `results for ${args.q}` }));
  const events = await collect(
    runAgentLoop(baseState({ tools: [tool] }), {
      streamFn: scriptedStream([
        piToolEvents('searching', { id: 'c1', name: 'search', arguments: { q: 'cats' } }),
        piTextEvents('here is what I found'),
      ]),
    }),
  );
  const toolResult = events.find((e) => e.type === 'tool_result');
  assert.ok(toolResult, 'should emit a tool_result');
  assert.equal(toolResult.output.text, 'results for cats');
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.finalMessage.text, 'here is what I found');
});

test('runAgentLoop: terminate-after-tool ends the run', async () => {
  const tool = echoTool('finish', async () => ({ text: 'done-now', terminate: true }));
  const events = await collect(
    runAgentLoop(baseState({ tools: [tool] }), {
      streamFn: fixedStream(piToolEvents('', { id: 'c1', name: 'finish', arguments: {} })),
    }),
  );
  // Only one turn should have happened (terminate stops before a 2nd stream).
  const turnEnds = events.filter((e) => e.type === 'turn_end');
  assert.equal(turnEnds.length, 1);
  assert.equal(events[events.length - 1].type, 'done');
});

test('runAgentLoop: recursion limit reached yields error + done', async () => {
  // The model always asks for a tool → never terminates → hits the cap.
  const tool = echoTool('loop', async () => ({ text: 'again' }));
  const events = await collect(
    runAgentLoop(baseState({ tools: [tool] }), {
      recursionLimit: 3,
      streamFn: fixedStream(piToolEvents('', { id: 'c', name: 'loop', arguments: {} })),
    }),
  );
  assert.ok(events.some((e) => e.type === 'error' && /Recursion limit/.test(e.error)));
  const turnEnds = events.filter((e) => e.type === 'turn_end');
  assert.equal(turnEnds.length, 3);
});

test('runAgentLoop: does not mutate the caller state.messages', async () => {
  const state = baseState();
  const before = state.messages.length;
  await collect(
    runAgentLoop(state, { streamFn: fixedStream(piTextEvents('hi')) }),
  );
  assert.equal(state.messages.length, before);
});

test('runAgentLoop: persists messages to an injected session repo', async () => {
  const appended = [];
  const session = {
    append: async (threadId, message) => {
      appended.push({ threadId, role: message.role });
    },
    load: async () => [],
    list: async () => [],
    branch: async () => 'x',
    truncateAfter: async () => {},
  };
  const tool = echoTool('t', async () => ({ text: 'ok' }));
  await collect(
    runAgentLoop(baseState({ tools: [tool] }), {
      session,
      streamFn: scriptedStream([
        piToolEvents('', { id: 'c1', name: 't', arguments: {} }),
        piTextEvents('final'),
      ]),
    }),
  );
  // assistant(turn1) + tool result + assistant(turn2) = 3 appends.
  assert.equal(appended.length, 3);
  assert.deepEqual(appended.map((a) => a.role), ['assistant', 'toolResult', 'assistant']);
  assert.ok(appended.every((a) => typeof a.threadId === 'string'));
});

// =============================================================================
// T8 — createAgent
// =============================================================================

test('createAgent.prompt: seeds the user message and runs the loop', async () => {
  const seenMessages = [];
  const streamFn = (req) => {
    seenMessages.push(...req.messages.map((m) => m.role));
    return streamOf(piTextEvents('reply'));
  };
  const agent = createAgent({ streamFn });
  const events = await collect(agent.prompt(baseState(), { text: 'hello agent' }));
  // The user message should have been seeded into the state the model saw.
  assert.ok(seenMessages.includes('user'));
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.finalMessage.text, 'reply');
});

test('createAgent.continue: errors clearly without a session', async () => {
  const agent = createAgent({ streamFn: fixedStream(piTextEvents('x')) });
  const events = await collect(agent.continue('thread_1', { text: 'resume' }));
  assert.ok(events.some((e) => e.type === 'error' && /session/.test(e.error)));
});
