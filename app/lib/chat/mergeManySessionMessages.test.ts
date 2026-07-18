import { describe, expect, it } from 'vitest';
import { mergeManySessionMessages } from './mergeManySessionMessages';
import type { ManyMessage } from '@/lib/store/useManyStore';

function msg(partial: Partial<ManyMessage> & Pick<ManyMessage, 'role' | 'content'>): ManyMessage {
  return {
    id: partial.id ?? `m-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: partial.timestamp ?? Date.now(),
    ...partial,
  };
}

describe('mergeManySessionMessages', () => {
  it('preserves local pinnedResources when JSONL user turn has no UI fields', () => {
    const local: ManyMessage[] = [
      msg({
        role: 'user',
        content: 'analiza el contenido de este post',
        timestamp: 1000,
        pinnedResources: [
          { id: 'sp-1', title: 'LinkedIn · published', type: 'social_post', kind: 'social_post' },
        ],
      }),
      msg({ role: 'assistant', content: 'ok', timestamp: 2000 }),
    ];
    const db: ManyMessage[] = [
      msg({ role: 'user', content: 'analiza el contenido de este post', timestamp: 1000 }),
      msg({ role: 'assistant', content: 'ok — respuesta larga del harness', timestamp: 2000 }),
    ];

    const merged = mergeManySessionMessages(local, db);
    const user = merged.find((m) => m.role === 'user');
    expect(user?.pinnedResources?.[0]?.id).toBe('sp-1');
    expect(merged.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('keeps empty chip-only user turns paired with local pins', () => {
    const local: ManyMessage[] = [
      msg({
        role: 'user',
        content: '',
        timestamp: 1000,
        pinnedResources: [
          { id: 'sp-2', title: 'Instagram · draft', type: 'social_post', kind: 'social_post' },
        ],
      }),
    ];
    const db: ManyMessage[] = [
      msg({ role: 'user', content: '', timestamp: 1050 }),
      msg({ role: 'assistant', content: 'hola', timestamp: 2000 }),
    ];

    const merged = mergeManySessionMessages(local, db);
    const user = merged.find((m) => m.role === 'user');
    expect(user?.pinnedResources?.[0]?.id).toBe('sp-2');
  });
});
