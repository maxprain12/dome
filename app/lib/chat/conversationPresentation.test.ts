import { describe, expect, it } from 'vitest';
import { groupMessagesByRole } from './groupMessagesByRole';
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
