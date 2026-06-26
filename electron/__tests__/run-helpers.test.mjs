import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isRunAbortedError,
  parseToolArguments,
  mergeLlmUsage,
  serializeToolResult,
  getToolStepPatch,
} = require('../agents/run-helpers.cjs');

describe('run-helpers', () => {
  it('parseToolArguments accepts JSON strings, objects and garbage', () => {
    assert.deepEqual(parseToolArguments('{"a":1}'), { a: 1 });
    assert.deepEqual(parseToolArguments({ b: 2 }), { b: 2 });
    assert.deepEqual(parseToolArguments('not-json'), {});
    assert.deepEqual(parseToolArguments(null), {});
  });

  it('mergeLlmUsage accumulates token counts across deltas', () => {
    const first = mergeLlmUsage(null, { inputTokens: 10, outputTokens: 5 });
    assert.deepEqual(first, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    const second = mergeLlmUsage(first, { input_tokens: 2, output_tokens: 3, total_tokens: 5 });
    assert.deepEqual(second, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    assert.equal(mergeLlmUsage(first, null), first);
  });

  it('serializeToolResult stringifies objects and passes strings through', () => {
    assert.equal(serializeToolResult('plain'), 'plain');
    assert.equal(serializeToolResult({ x: 1 }), '{"x":1}');
    assert.equal(serializeToolResult(undefined), 'null');
  });

  it('getToolStepPatch marks error results as failed with the message', () => {
    const patch = getToolStepPatch('tc1', { status: 'error', error: 'boom' });
    assert.equal(patch.status, 'failed');
    assert.equal(patch.content, 'boom');
    assert.equal(patch.metadata.toolCallId, 'tc1');
    assert.equal(patch.metadata.error, 'boom');
  });

  it('getToolStepPatch marks normal results as done', () => {
    const patch = getToolStepPatch('tc2', { status: 'success', data: [1, 2] });
    assert.equal(patch.status, 'done');
    assert.ok(patch.content.includes('success'));
  });

  it('getToolStepPatch caps a multi-MB string result so it cannot bloat the DB (ELECTRON-7)', () => {
    const huge = 'a'.repeat(9_000_000); // ~9MB, like the chrome_devtools snapshots we found in the DB
    const patch = getToolStepPatch('tc3', huge);
    assert.equal(patch.status, 'done');
    assert.ok(patch.content.length < huge.length);
    assert.ok(patch.content.length <= 64 * 1024);
    assert.ok(patch.content.includes('truncated for storage'));
  });

  it('isRunAbortedError detects abort signals and abort-like errors', () => {
    const controller = new AbortController();
    controller.abort();
    assert.equal(isRunAbortedError(new Error('whatever'), controller.signal), true);
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    assert.equal(isRunAbortedError(abortErr, undefined), true);
    assert.equal(isRunAbortedError(new Error('regular failure'), undefined), false);
  });
});
