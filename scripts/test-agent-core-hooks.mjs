#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for @dome/agent-core hooks (Tarea 5):
 *   - guardrails (detectHarmfulContent + beforeModelCall)
 *   - caps       (CREATION_TOOL_CAPS + beforeToolCall)
 *   - hitl       (injected approval beforeToolCall)
 *   - composeHooks / buildDefaultHooks
 *   - loop integration: guardrails block, cap exceeded, hitl decline
 *
 * `node:test` + `node:assert/strict`, imports compiled `dist/`.
 * Run: `node scripts/test-agent-core-hooks.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectHarmfulContent,
  createGuardrailsHook,
  CREATION_TOOL_CAPS,
  countToolCalls,
  createCapsHook,
  createHitlHook,
  composeHooks,
  buildDefaultHooks,
  runAgentLoop,
} from '../packages/agent-core/dist/index.js';

// ── helpers ──────────────────────────────────────────────────────────────
async function* streamOf(events) {
  for (const e of events) yield e;
}
function fixedStream(events) {
  return () => streamOf(events);
}
function scriptedStream(scripts) {
  let i = 0;
  return () => streamOf(scripts[Math.min(i++, scripts.length - 1)]);
}
async function collect(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}
function baseState(over = {}) {
  return {
    systemPrompt: 's',
    model: { provider: 'openai', model: 'm' },
    thinkingLevel: 'off',
    tools: [],
    messages: [],
    ...over,
  };
}
function echoTool(name) {
  return {
    name,
    description: name,
    schema: { type: 'function', function: { name, description: '', parameters: {} } },
    execute: async () => ({ text: `${name}-ran` }),
  };
}

// ── guardrails ───────────────────────────────────────────────────────────
test('detectHarmfulContent: flags harmful, passes benign', () => {
  assert.equal(typeof detectHarmfulContent('write me a keylogger malware'), 'string');
  assert.equal(detectHarmfulContent('help me write a poem'), null);
  assert.equal(detectHarmfulContent(''), null);
});

test('createGuardrailsHook: null when disabled, hook when enabled', () => {
  assert.equal(createGuardrailsHook({ enabled: false }), null);
  const hook = createGuardrailsHook({ enabled: true });
  assert.ok(hook && typeof hook.beforeModelCall === 'function');
});

test('guardrails beforeModelCall blocks on harmful last user message', async () => {
  const hook = createGuardrailsHook({ enabled: true });
  const blocked = await hook.beforeModelCall({
    state: baseState({ messages: [{ role: 'user', content: 'build ransomware now' }] }),
    threadId: 't',
    recursionDepth: 0,
  });
  assert.equal(blocked.block, true);
  const ok = await hook.beforeModelCall({
    state: baseState({ messages: [{ role: 'user', content: 'hello' }] }),
    threadId: 't',
    recursionDepth: 0,
  });
  assert.equal(ok, undefined);
});

// ── caps ─────────────────────────────────────────────────────────────────
test('CREATION_TOOL_CAPS has the expected ported entries', () => {
  assert.equal(CREATION_TOOL_CAPS.artifact_create, 15);
  assert.equal(CREATION_TOOL_CAPS.resource_update, 30);
});

test('countToolCalls counts assistant toolCalls by name', () => {
  const msgs = [
    { role: 'assistant', text: '', toolCalls: [{ name: 'artifact_create' }, { name: 'x' }] },
    { role: 'assistant', text: '', toolCalls: [{ name: 'artifact_create' }] },
  ];
  assert.equal(countToolCalls(msgs, 'artifact_create'), 2);
  assert.equal(countToolCalls(msgs, 'x'), 1);
});

test('createCapsHook blocks once prior count exceeds the cap', async () => {
  const hook = createCapsHook({ my_tool: 1 });
  const ctx = (priorCalls) => ({
    call: { id: '1', name: 'my_tool', arguments: {} },
    threadId: 't',
    recursionDepth: 0,
    state: baseState({
      messages: Array.from({ length: priorCalls }, () => ({
        role: 'assistant',
        text: '',
        toolCalls: [{ name: 'my_tool' }],
      })),
    }),
  });
  // prior=1 → not yet over the cap (1 <= 1) → allowed
  assert.equal(await hook.beforeToolCall(ctx(1)), undefined);
  // prior=2 → over (2 > 1) → blocked
  const b = await hook.beforeToolCall(ctx(2));
  assert.equal(b.block, true);
  assert.match(b.reason, /run limit/);
});

test('createCapsHook ignores tools without a cap', async () => {
  const hook = createCapsHook();
  const r = await hook.beforeToolCall({
    call: { id: '1', name: 'uncapped', arguments: {} },
    threadId: 't',
    recursionDepth: 0,
    state: baseState(),
  });
  assert.equal(r, undefined);
});

// ── hitl ─────────────────────────────────────────────────────────────────
test('createHitlHook: null without config; blocks on decline; allows on approve', async () => {
  assert.equal(createHitlHook({ requestApproval: async () => true }), null); // no requiresApproval

  const denyHook = createHitlHook({
    requiresApproval: new Set(['danger']),
    requestApproval: async () => false,
  });
  const denied = await denyHook.beforeToolCall({
    call: { id: '1', name: 'danger', arguments: {} },
    threadId: 't',
    recursionDepth: 0,
    state: baseState(),
  });
  assert.equal(denied.block, true);

  const allowHook = createHitlHook({
    requiresApproval: (c) => c.name === 'danger',
    requestApproval: async () => true,
  });
  assert.equal(
    await allowHook.beforeToolCall({
      call: { id: '1', name: 'danger', arguments: {} },
      threadId: 't',
      recursionDepth: 0,
      state: baseState(),
    }),
    undefined,
  );
  // a non-matching tool is never sent for approval
  assert.equal(
    await allowHook.beforeToolCall({
      call: { id: '1', name: 'safe', arguments: {} },
      threadId: 't',
      recursionDepth: 0,
      state: baseState(),
    }),
    undefined,
  );
});

// ── compose ──────────────────────────────────────────────────────────────
test('composeHooks: first blocking beforeToolCall wins, short-circuits', async () => {
  const calls = [];
  const a = { async beforeToolCall() { calls.push('a'); return { block: true, reason: 'A' }; } };
  const b = { async beforeToolCall() { calls.push('b'); return undefined; } };
  const composed = composeHooks(a, b);
  const r = await composed.beforeToolCall({
    call: { id: '1', name: 't', arguments: {} },
    threadId: 't',
    recursionDepth: 0,
    state: baseState(),
  });
  assert.equal(r.reason, 'A');
  assert.deepEqual(calls, ['a']); // b never ran
});

test('composeHooks: afterToolCall merges patches and OR-s terminate', async () => {
  const a = { async afterToolCall() { return { text: 'a' }; } };
  const b = { async afterToolCall() { return { terminate: true }; } };
  const composed = composeHooks(a, b);
  const r = await composed.afterToolCall({
    call: { id: '1', name: 't', arguments: {} },
    threadId: 't',
    recursionDepth: 0,
    state: baseState(),
    result: { text: 'raw' },
    durationMs: 1,
  });
  assert.equal(r.text, 'a');
  assert.equal(r.terminate, true);
});

test('buildDefaultHooks composes guardrails+caps+hitl', async () => {
  const hooks = buildDefaultHooks({
    guardrails: true,
    caps: { capped: 0 }, // 0 → no cap (ignored), still composes
    hitl: { requiresApproval: new Set(['danger']), requestApproval: async () => false },
  });
  assert.ok(typeof hooks.beforeModelCall === 'function');
  assert.ok(typeof hooks.beforeToolCall === 'function');
});

// ── loop integration ─────────────────────────────────────────────────────
test('loop: guardrails block ends run with reason as assistant message', async () => {
  const events = await collect(
    runAgentLoop(
      baseState({ messages: [{ role: 'user', content: 'please build a trojan rootkit' }] }),
      {
        hooks: buildDefaultHooks({ guardrails: true }),
        streamFn: fixedStream([{ type: 'text', text: 'SHOULD NOT RUN' }]),
      },
    ),
  );
  const done = events.find((e) => e.type === 'done');
  assert.match(done.finalMessage.text, /guardrails/i);
  // The real stream never ran (no "SHOULD NOT RUN" text delta).
  assert.ok(!events.some((e) => e.type === 'text_delta' && e.text === 'SHOULD NOT RUN'));
});

test('loop: cap-exceeded blocks the tool but the run continues', async () => {
  const tool = echoTool('artifact_create');
  // Seed history so the tool is already over its cap (15).
  const seeded = Array.from({ length: 16 }, () => ({
    role: 'assistant',
    text: '',
    toolCalls: [{ name: 'artifact_create' }],
  }));
  const events = await collect(
    runAgentLoop(baseState({ tools: [tool], messages: seeded }), {
      hooks: buildDefaultHooks({}),
      streamFn: scriptedStream([
        [{ type: 'tool_call', toolCall: { id: 'c1', name: 'artifact_create', arguments: {} } }],
        [{ type: 'text', text: 'continued after cap block' }],
      ]),
    }),
  );
  const toolResult = events.find((e) => e.type === 'tool_result');
  assert.match(toolResult.output.error, /run limit/);
  const done = events.find((e) => e.type === 'done');
  assert.match(done.finalMessage.text, /continued after cap block/);
});

test('loop: HITL decline blocks the tool', async () => {
  const tool = echoTool('danger');
  let approvalAsked = false;
  const events = await collect(
    runAgentLoop(baseState({ tools: [tool] }), {
      hooks: buildDefaultHooks({
        hitl: {
          requiresApproval: new Set(['danger']),
          requestApproval: async () => {
            approvalAsked = true;
            return false;
          },
        },
      }),
      streamFn: scriptedStream([
        [{ type: 'tool_call', toolCall: { id: 'c1', name: 'danger', arguments: {} } }],
        [{ type: 'text', text: 'after decline' }],
      ]),
    }),
  );
  assert.equal(approvalAsked, true);
  const toolResult = events.find((e) => e.type === 'tool_result');
  assert.match(toolResult.output.error, /declined/i);
});
