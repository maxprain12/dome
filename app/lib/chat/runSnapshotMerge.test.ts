import { describe, expect, it } from 'vitest';
import { mergeRunSnapshotIntoStreamingMessage } from './runSnapshotMerge';

describe('mergeRunSnapshotIntoStreamingMessage', () => {
  it('fills content from the snapshot when the bubble is still empty (reconnect)', () => {
    const next = mergeRunSnapshotIntoStreamingMessage(null, {
      id: 'run-1',
      content: 'Hola',
      timestamp: 1,
      isStreaming: true,
    });
    expect(next.content).toBe('Hola');
    expect(next.id).toBe('run-1');
  });

  it('does not replace live delta-accumulated content with a heartbeat snapshot', () => {
    const next = mergeRunSnapshotIntoStreamingMessage(
      {
        id: 'run-1',
        role: 'assistant',
        content: 'Hola mundo',
        timestamp: 1,
        isStreaming: true,
      },
      {
        id: 'run-1',
        content: 'Hola',
        timestamp: 2,
        isStreaming: true,
      },
    );
    expect(next.content).toBe('Hola mundo');
  });

  it('keeps thinking and toolCalls from the live bubble', () => {
    const next = mergeRunSnapshotIntoStreamingMessage(
      {
        id: 'run-1',
        role: 'assistant',
        content: 'ok',
        timestamp: 1,
        isStreaming: true,
        thinking: 'razonando',
        toolCalls: [{ id: 't1', name: 'search', arguments: {}, status: 'running' }],
      },
      {
        id: 'run-1',
        content: 'ok extra',
        timestamp: 3,
        isStreaming: true,
        streamingLabel: 'Generando',
      },
    );
    expect(next.thinking).toBe('razonando');
    expect(next.toolCalls).toHaveLength(1);
    expect(next.streamingLabel).toBe('Generando');
    expect(next.content).toBe('ok');
  });
});
