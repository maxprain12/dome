/**
 * Regression test for the Many live-streaming bug: a `runs:updated` snapshot must
 * NOT erase the live deltas (thinking / runSteps / toolCalls) accumulated from the
 * `runs:chunk` stream. Pins root cause A of the agent-harness audit.
 *
 * Run: pnpm run test:streaming-snapshot
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRunSnapshotIntoStreamingMessage } from '../app/lib/chat/runSnapshotMerge.ts';

const liveBubble = () => ({
  id: 'run-abc',
  role: 'assistant' as const,
  content: 'partial answer',
  timestamp: 1000,
  isStreaming: true,
  thinking: 'reasoning so far…',
  runSteps: [{ id: 's1', kind: 'tool', label: 'Searching the web' }],
  toolCalls: [{ id: 't1', name: 'web_search', status: 'running' }],
});

test('snapshot merge preserves thinking accumulated from the chunk stream', () => {
  const next = mergeRunSnapshotIntoStreamingMessage(liveBubble() as never, {
    id: 'run-abc',
    content: 'partial answer more',
    timestamp: 1001,
    isStreaming: true,
  });
  assert.equal((next as { thinking?: string }).thinking, 'reasoning so far…');
});

test('snapshot merge preserves runSteps (the tool timeline cards)', () => {
  const next = mergeRunSnapshotIntoStreamingMessage(liveBubble() as never, {
    id: 'run-abc',
    content: 'x',
    timestamp: 1001,
    isStreaming: true,
  });
  assert.equal((next as { runSteps?: unknown[] }).runSteps?.length, 1);
});

test('snapshot merge preserves toolCalls and never regresses to empty mid-run', () => {
  const next = mergeRunSnapshotIntoStreamingMessage(liveBubble() as never, {
    id: 'run-abc',
    content: 'x',
    timestamp: 1001,
    isStreaming: true,
  });
  assert.equal((next as { toolCalls?: unknown[] }).toolCalls?.length, 1);
});

test('snapshot is authoritative for content / isStreaming / timestamp', () => {
  const next = mergeRunSnapshotIntoStreamingMessage(liveBubble() as never, {
    id: 'run-abc',
    content: 'final-ish text',
    timestamp: 2000,
    isStreaming: false,
    streamingLabel: 'Waiting for approval',
  });
  assert.equal(next.content, 'final-ish text');
  assert.equal(next.isStreaming, false);
  assert.equal(next.timestamp, 2000);
  assert.equal((next as { streamingLabel?: string }).streamingLabel, 'Waiting for approval');
});

test('with no previous bubble, the snapshot id and empty toolCalls seed the message', () => {
  const next = mergeRunSnapshotIntoStreamingMessage(null, {
    id: 'run-new',
    content: '',
    timestamp: 5,
    isStreaming: true,
  });
  assert.equal(next.id, 'run-new');
  assert.deepEqual((next as { toolCalls?: unknown[] }).toolCalls, []);
});

test('previous streamingLabel survives when snapshot omits one', () => {
  const prev = { ...liveBubble(), streamingLabel: 'Thinking…' };
  const next = mergeRunSnapshotIntoStreamingMessage(prev as never, {
    id: 'run-abc',
    content: 'x',
    timestamp: 1001,
    isStreaming: true,
  });
  assert.equal((next as { streamingLabel?: string }).streamingLabel, 'Thinking…');
});
