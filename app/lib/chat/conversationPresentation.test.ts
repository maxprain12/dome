import { describe, expect, it } from 'vitest';
import { groupMessagesByRole, withLiveStreamingMessage } from './groupMessagesByRole';
import { mergeManySessionMessages } from './mergeManySessionMessages';

describe('conversation presentation model', () => {
  it('keeps delegation boundaries even when consecutive messages share a role', () => {
    const groups = groupMessagesByRole([
      { id: '1', role: 'assistant', content: 'Analizo', timestamp: 1, agentLabel: 'Planner' },
      { id: '2', role: 'assistant', content: 'Plan listo', timestamp: 2, agentLabel: 'Planner' },
      { id: '3', role: 'assistant', content: 'Ejecuto', timestamp: 3, agentLabel: 'Builder' },
      { id: '4', role: 'user', content: 'Continúa', timestamp: 4 },
    ]);

    expect(groups.map((group) => group.map((message) => message.id))).toEqual([
      ['1', '2'],
      ['3'],
      ['4'],
    ]);
  });

  it('keeps the richer completed streaming event when local and persisted turns overlap', () => {
    const merged = mergeManySessionMessages(
      [{ id: 'local', role: 'assistant', content: 'Resultado', timestamp: 1 }],
      [{
        id: 'persisted',
        role: 'assistant',
        content: 'Resultado completo',
        timestamp: 2,
        toolCalls: [{ id: 'tool', name: 'search', arguments: {}, status: 'success', result: { ok: true } }],
      }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('persisted');
    expect(merged[0]?.toolCalls?.[0]?.result).toEqual({ ok: true });
  });
});

describe('withLiveStreamingMessage', () => {
  it('drops the live bubble when the store already has the same assistant turn', () => {
    const persisted = { id: 'msg-1', role: 'assistant', content: 'Resumen del contacto' };
    const streaming = { id: 'run-1', role: 'assistant', content: 'Resumen del contacto' };
    expect(withLiveStreamingMessage([persisted], streaming)).toEqual([streaming]);
  });

  it('keeps only the persisted turn when persist finished first', () => {
    const persisted = { id: 'msg-1', role: 'assistant', content: 'Resumen del contacto completo' };
    const streaming = { id: 'run-1', role: 'assistant', content: 'Resumen del contacto' };
    expect(withLiveStreamingMessage([persisted], streaming)).toEqual([persisted]);
  });

  it('appends the live bubble when it is a new assistant turn', () => {
    const user = { id: 'u1', role: 'user', content: 'quién es mery?' };
    const streaming = { id: 'run-1', role: 'assistant', content: 'Voy a revisar' };
    expect(withLiveStreamingMessage([user], streaming)).toEqual([user, streaming]);
  });

  it('never stacks persist and stream as two assistant bubbles on the same turn', () => {
    const persisted = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Voy a buscar a la persona.',
      toolCalls: [{ id: 't1', name: 'people_get' }],
    };
    const streaming = {
      id: 'run-1',
      role: 'assistant',
      content: 'Voy a buscar a la persona.\n\nYa tengo la ficha.',
      isStreaming: true,
      toolCalls: [] as { id: string; name: string }[],
    };
    expect(withLiveStreamingMessage([persisted], streaming)).toEqual([streaming]);
  });
});
