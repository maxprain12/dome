#!/usr/bin/env node
/* eslint-disable */
/**
 * Tests for the Phase 2 runtime selector (`electron/agent-runtime.cjs`):
 *   - resolveRuntime              (env precedence)
 *   - mapAgentEventToChunk        (AgentEvent → legacy onChunk shape)
 *
 * The OpenAI-defs → AgentTool bridge moved to `@dome/tools`
 * (`createToolRegistry`) and is covered by `test-dome-tools.mjs`. The
 * `runManyAgent` domeagent branch + `createStreamFnAdapter` need a live
 * provider and are covered by the parity scaffold / manual smoke test.
 *
 * `node:test`; imports the CJS module via dynamic import (root is ESM).
 * Run: `node scripts/test-agent-runtime-selector.mjs`
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const rt = (await import('../electron/agents/agent-runtime.cjs')).default;

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// ── resolveRuntime ─────────────────────────────────────────────────────────
test('resolveRuntime: defaults to langgraph', () => {
  withEnv({ DOME_AGENT_RUNTIME: undefined, DOME_AGENT_RUNTIME_MANY: undefined }, () => {
    assert.equal(rt.resolveRuntime('many'), 'langgraph');
  });
});

test('resolveRuntime: global env overrides default', () => {
  withEnv({ DOME_AGENT_RUNTIME: 'domeagent', DOME_AGENT_RUNTIME_MANY: undefined }, () => {
    assert.equal(rt.resolveRuntime('many'), 'domeagent');
  });
});

test('resolveRuntime: per-surface override beats global', () => {
  withEnv({ DOME_AGENT_RUNTIME: 'domeagent', DOME_AGENT_RUNTIME_MANY: 'langgraph' }, () => {
    assert.equal(rt.resolveRuntime('many'), 'langgraph');
  });
  withEnv({ DOME_AGENT_RUNTIME: 'langgraph', DOME_AGENT_RUNTIME_MANY: 'domeagent' }, () => {
    assert.equal(rt.resolveRuntime('many'), 'domeagent');
  });
});

test('resolveRuntime: surface name is normalized (hyphen → underscore)', () => {
  withEnv({ DOME_AGENT_RUNTIME: undefined, DOME_AGENT_RUNTIME_AGENT_TEAM: 'domeagent' }, () => {
    assert.equal(rt.resolveRuntime('agent-team'), 'domeagent');
  });
});

// ── mapAgentEventToChunk ───────────────────────────────────────────────────
test('mapAgentEventToChunk: text_delta → {type:text}', () => {
  assert.deepEqual(rt.mapAgentEventToChunk({ type: 'text_delta', text: 'hi' }), {
    type: 'text',
    text: 'hi',
  });
});

test('mapAgentEventToChunk: tool_call stringifies arguments', () => {
  const out = rt.mapAgentEventToChunk({
    type: 'tool_call',
    call: { id: 'c1', name: 'search', arguments: { q: 'x' } },
  });
  assert.equal(out.type, 'tool_call');
  assert.equal(out.toolCall.id, 'c1');
  assert.equal(out.toolCall.name, 'search');
  assert.equal(out.toolCall.arguments, JSON.stringify({ q: 'x' }));
});

test('mapAgentEventToChunk: tool_result uses output.text', () => {
  const out = rt.mapAgentEventToChunk({
    type: 'tool_result',
    callId: 'c1',
    name: 'search',
    output: { text: 'found it' },
  });
  assert.deepEqual(out, { type: 'tool_result', toolCallId: 'c1', result: 'found it' });
});

test('mapAgentEventToChunk: usage / done / error map; internal events → null', () => {
  assert.deepEqual(rt.mapAgentEventToChunk({ type: 'usage', usage: { totalTokens: 5 } }), {
    type: 'usage',
    usage: { totalTokens: 5 },
    partial: false,
  });
  assert.deepEqual(rt.mapAgentEventToChunk({ type: 'done' }), { type: 'done' });
  assert.deepEqual(rt.mapAgentEventToChunk({ type: 'error', error: 'boom' }), {
    type: 'error',
    error: 'boom',
  });
  assert.equal(rt.mapAgentEventToChunk({ type: 'turn_start' }), null);
  assert.equal(rt.mapAgentEventToChunk({ type: 'turn_end', message: {} }), null);
});
