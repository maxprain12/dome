#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for @dome/agent-core compaction engine (Tarea 3).
 *
 * Uses `node:test` and `node:assert/strict` (built-in — no vitest).
 * Imports the compiled output from `packages/agent-core/dist/compaction/`
 * so it works without re-running `tsc` between writes.
 *
 * The tests cover the contract specified in
 * `longrunning-task/phases/phase-2-dome-agent-core.PLAN.md` section 3:
 *
 *   - `needs()` returns `false` when the prompt is small.
 *   - `needs()` returns `true` when the prompt exceeds the threshold.
 *   - `compact()` preserves the first system message.
 *   - `compact()` trims old turns and keeps the recent N.
 *   - `compact()` with `preserveVision=true` keeps the latest vision message.
 *   - `compact()` with `preserveVision=false` may drop vision messages.
 *   - `estimateTokens('hello world') === 3` (char/4 ceil).
 *   - `compact()` returns a NEW AgentState (no mutation of the input).
 *
 * Invocation: `node scripts/test-agent-core-compaction.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTrimmingEngine,
  createDefaultCompaction,
  estimateTokens,
} from '../packages/agent-core/dist/compaction/index.js';

// =============================================================================
// Test fixtures
// =============================================================================

/**
 * Build a minimal `AgentState` for testing. The runtime loop is the
 * only consumer of the real shape; the compaction engine only reads
 * `systemPrompt` + `messages` so we can leave the rest as opaque.
 */
function makeState(messages, systemPrompt = 'You are Dome.') {
  return {
    systemPrompt,
    model: { provider: 'openai', model: 'gpt-4o' },
    thinkingLevel: 'low',
    tools: [],
    messages,
  };
}

/** Build a text message of a given role with the given text. */
function textMsg(role, text) {
  return { role, content: text };
}

/** Build an assistant message (`AssistantMessage` shape: `{ text, toolCalls?, ... }`). */
function assistantMsg(text, toolCalls) {
  const m = { role: 'assistant', content: text, text };
  if (toolCalls) m.toolCalls = toolCalls;
  return m;
}

/** Build a tool result message (`role: 'tool'`, optional `toolCallId`). */
function toolMsg(text, callId) {
  const m = { role: 'tool', content: text };
  if (callId) m.toolCallId = callId;
  return m;
}

/** Build a user message with an inline image block (vision payload). */
function visionUserMsg(text) {
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ],
  };
}

/** Build a user message with `attachments.images` set (alternate vision shape). */
function visionAttachmentUserMsg(text) {
  return {
    role: 'user',
    content: text,
    attachments: { images: [{ url: 'data:image/png;base64,BBBB' }] },
  };
}

/** Pad a string with `n` characters so the token estimate is predictable. */
function pad(s, n) {
  return s + 'x'.repeat(Math.max(0, n - s.length));
}

// =============================================================================
// estimateTokens
// =============================================================================

test('estimateTokens: 11-char string rounds up to 3 (11 / 4 = 2.75)', () => {
  assert.equal(estimateTokens('hello world'), 3);
});

test('estimateTokens: 4-char string is 1', () => {
  assert.equal(estimateTokens('abcd'), 1);
});

test('estimateTokens: empty string is 0', () => {
  assert.equal(estimateTokens(''), 0);
});

test('estimateTokens: short string (< 4) still rounds up to 1', () => {
  assert.equal(estimateTokens('a'), 1);
  assert.equal(estimateTokens('ab'), 1);
  assert.equal(estimateTokens('abc'), 1);
});

test('estimateTokens: 400-char string is 100', () => {
  assert.equal(estimateTokens('x'.repeat(400)), 100);
});

// =============================================================================
// needs()
// =============================================================================

test('needs() returns false when system + history is well under threshold', () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 1000,
    maxRetainedTurns: 2,
    preserveVision: true,
  });
  const state = makeState(
    [textMsg('user', 'hi'), assistantMsg('hello')],
    'You are Dome.',
  );
  assert.equal(engine.needs(state), false);
});

test('needs() returns true when system + history exceeds threshold', () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10, // 10 tokens ≈ 40 chars — easy to exceed
    maxRetainedTurns: 5,
    preserveVision: true,
  });
  const state = makeState(
    [textMsg('user', pad('hello', 500)), assistantMsg(pad('world', 500))],
    'You are Dome.',
  );
  assert.equal(engine.needs(state), true);
});

test('default compaction uses thresholdTokens=100_000 and needs() is false for typical state', () => {
  const engine = createDefaultCompaction();
  const state = makeState(
    [textMsg('user', 'hi'), assistantMsg('hello')],
    'You are Dome.',
  );
  assert.equal(engine.needs(state), false);
});

// =============================================================================
// compact(): system preservation
// =============================================================================

test('compact() preserves the first system message', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: false,
  });
  const systemMsg = textMsg('system', 'You are a helpful assistant. ' + 'x'.repeat(500));
  const state = makeState(
    [
      systemMsg,
      textMsg('user', pad('first', 500)),
      assistantMsg('first reply'),
      textMsg('user', pad('second', 500)),
      assistantMsg('second reply'),
    ],
    'You are Dome.',
  );
  const out = await engine.compact(state);
  const firstMsg = out.messages[0];
  assert.ok(firstMsg, 'compact() returned at least one message');
  assert.equal(firstMsg.role, 'system');
  assert.equal(firstMsg.content, systemMsg.content);
});

test('compact() works on a state with no system message', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: false,
  });
  const state = makeState(
    [
      textMsg('user', pad('a', 500)),
      assistantMsg('a-reply'),
      textMsg('user', pad('b', 500)),
      assistantMsg('b-reply'),
    ],
    'You are Dome.',
  );
  const out = await engine.compact(state);
  // No system message should be present.
  assert.equal(out.messages[0].role, 'user');
});

// =============================================================================
// compact(): turn trimming
// =============================================================================

test('compact() trims old turns and retains the last maxRetainedTurns', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 2,
    preserveVision: false,
  });
  // Build 5 turns.
  const msgs = [
    textMsg('user', pad('turn-1 user', 500)),
    assistantMsg('turn-1 reply'),
    textMsg('user', pad('turn-2 user', 500)),
    assistantMsg('turn-2 reply'),
    textMsg('user', pad('turn-3 user', 500)),
    assistantMsg('turn-3 reply'),
    textMsg('user', pad('turn-4 user', 500)),
    assistantMsg('turn-4 reply'),
    textMsg('user', pad('turn-5 user', 500)),
    assistantMsg('turn-5 reply'),
  ];
  const state = makeState(msgs, pad('system', 500));
  const out = await engine.compact(state);

  // The retained window should include turn-4 and turn-5.
  const userTexts = out.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content);
  assert.ok(
    userTexts.some((t) => t.includes('turn-4 user')),
    'turn-4 should be retained',
  );
  assert.ok(
    userTexts.some((t) => t.includes('turn-5 user')),
    'turn-5 should be retained',
  );
  assert.ok(
    !userTexts.some((t) => t.includes('turn-1 user')),
    'turn-1 should be dropped',
  );
  assert.ok(
    !userTexts.some((t) => t.includes('turn-2 user')),
    'turn-2 should be dropped',
  );
});

test('compact() preserves tool results attached to a retained assistant turn', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: false,
  });
  // Build 3 turns; only the last should be kept. The last assistant
  // has 2 tool calls and we expect both tool result messages to be
  // preserved alongside it (they belong to the same turn).
  const msgs = [
    textMsg('user', pad('u1', 500)),
    assistantMsg('a1'),
    textMsg('user', pad('u2', 500)),
    assistantMsg('a2'),
    textMsg('user', pad('u3', 500)),
    assistantMsg('a3', [
      { id: 'call-1', name: 'search', arguments: { q: 'foo' } },
      { id: 'call-2', name: 'read', arguments: { path: 'x' } },
    ]),
    toolMsg('search result', 'call-1'),
    toolMsg('read result', 'call-2'),
  ];
  const state = makeState(msgs, pad('system', 500));
  const out = await engine.compact(state);

  // The last user + assistant + both tool results must be present.
  const tools = out.messages.filter((m) => m.role === 'tool');
  assert.equal(tools.length, 2, 'both tool results must be retained');
  assert.ok(out.messages.some((m) => m.content === 'search result'));
  assert.ok(out.messages.some((m) => m.content === 'read result'));
  // The last assistant turn must be present.
  assert.ok(out.messages.some((m) => m.text === 'a3'));
  // Earlier user/assistant turns should be gone.
  assert.ok(!out.messages.some((m) => m.content === pad('u1', 500)));
  assert.ok(!out.messages.some((m) => m.content === pad('u2', 500)));
});

test('compact() returns a short list when the input is already small', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 100_000,
    maxRetainedTurns: 10,
    preserveVision: true,
  });
  const state = makeState(
    [textMsg('user', 'hi'), assistantMsg('hello')],
    'You are Dome.',
  );
  const out = await engine.compact(state);
  assert.equal(out.messages.length, 2);
});

// =============================================================================
// compact(): vision preservation
// =============================================================================

test('compact() with preserveVision=true retains the latest vision message', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: true,
  });
  // Vision payload in the older turn (turn-1). It should be rescued
  // into the result alongside the recent turn-2.
  const vision = visionUserMsg('look at this');
  const msgs = [
    vision,
    assistantMsg('I see it'),
    textMsg('user', pad('turn-2 user', 500)),
    assistantMsg('turn-2 reply'),
  ];
  const state = makeState(msgs, pad('system', 500));
  const out = await engine.compact(state);

  // The vision message should be in the output.
  const hasVision = out.messages.some((m) => {
    if (m.role !== 'user') return false;
    if (Array.isArray(m.content)) {
      return m.content.some(
        (b) => b && typeof b === 'object' && (b.type === 'image' || b.type === 'image_url'),
      );
    }
    return false;
  });
  assert.ok(hasVision, 'the vision message must be retained');
});

test('compact() with preserveVision=true handles attachments.images shape', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: true,
  });
  const vision = visionAttachmentUserMsg('see attached');
  const msgs = [
    vision,
    assistantMsg('ack'),
    textMsg('user', pad('u2', 500)),
    assistantMsg('a2'),
  ];
  const state = makeState(msgs, pad('system', 500));
  const out = await engine.compact(state);
  const hasAttachments = out.messages.some(
    (m) => m.role === 'user' && Array.isArray(m.attachments?.images) && m.attachments.images.length > 0,
  );
  assert.ok(hasAttachments, 'attachments.images must be retained');
});

test('compact() with preserveVision=false may drop vision messages', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: false,
  });
  // Vision in the older turn; with preserveVision=false it should be
  // dropped (the recent turn remains).
  const vision = visionUserMsg('look at this');
  const msgs = [
    vision,
    assistantMsg('I see it'),
    textMsg('user', pad('u2', 500)),
    assistantMsg('a2'),
  ];
  const state = makeState(msgs, pad('system', 500));
  const out = await engine.compact(state);

  const hasVision = out.messages.some((m) => {
    if (m.role !== 'user') return false;
    if (Array.isArray(m.content)) {
      return m.content.some(
        (b) => b && typeof b === 'object' && (b.type === 'image' || b.type === 'image_url'),
      );
    }
    return false;
  });
  assert.equal(hasVision, false, 'vision message must be dropped when preserveVision=false');
});

// =============================================================================
// compact(): immutability
// =============================================================================

test('compact() returns a NEW AgentState (does not mutate the input)', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: true,
  });
  const originalMessages = [
    textMsg('user', pad('u1', 500)),
    assistantMsg('a1'),
    textMsg('user', pad('u2', 500)),
    assistantMsg('a2'),
  ];
  const state = makeState(originalMessages, pad('system', 500));

  // Snapshot the input for later comparison.
  const inputMessagesRef = state.messages;
  const inputLength = state.messages.length;

  const out = await engine.compact(state);

  // 1. The output is a different object reference.
  assert.notEqual(out, state, 'compact() must return a new state object');

  // 2. The input state.messages is the same array reference (not
  //    mutated). We assert by identity here.
  assert.equal(state.messages, inputMessagesRef, 'input state.messages must not be replaced');
  assert.equal(state.messages.length, inputLength, 'input state.messages must not be resized');

  // 3. The output messages array is a new array.
  assert.notEqual(out.messages, state.messages, 'output messages must be a new array');
});

// =============================================================================
// compact(): edge cases
// =============================================================================

test('compact() on an empty state returns an empty message list', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 1,
    maxRetainedTurns: 1,
    preserveVision: true,
  });
  const state = makeState([], 'You are Dome.');
  const out = await engine.compact(state);
  assert.equal(out.messages.length, 0);
  assert.equal(out.systemPrompt, 'You are Dome.');
});

test('compact() on a system-only state returns the system message', async () => {
  const engine = createTrimmingEngine({
    thresholdTokens: 1,
    maxRetainedTurns: 1,
    preserveVision: true,
  });
  const state = makeState([textMsg('system', 'You are Dome.')], 'You are Dome.');
  const out = await engine.compact(state);
  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].role, 'system');
});

test('default compaction is non-throwing and uses the trimming engine', () => {
  const engine = createDefaultCompaction();
  assert.equal(typeof engine.needs, 'function');
  assert.equal(typeof engine.compact, 'function');
});

test('createDefaultCompaction accepts overrides', async () => {
  const engine = createDefaultCompaction({
    thresholdTokens: 10,
    maxRetainedTurns: 1,
    preserveVision: false,
  });
  const state = makeState(
    [
      textMsg('user', pad('u1', 500)),
      assistantMsg('a1'),
      textMsg('user', pad('u2', 500)),
      assistantMsg('a2'),
    ],
    pad('system', 500),
  );
  assert.equal(engine.needs(state), true);
  const out = await engine.compact(state);
  // Only one turn kept.
  const userCount = out.messages.filter((m) => m.role === 'user').length;
  assert.equal(userCount, 1);
});
