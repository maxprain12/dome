import { describe, expect, it } from 'vitest';
import { mergeExtensionResources } from './i18n';

describe('mergeExtensionResources', () => {
  it('keeps the Chat tab label when chat.json occupies the chat key', () => {
    const merged = mergeExtensionResources(
      { chat: 'Chat', history: 'Historial' },
      {
        notes: { title: 'Notas' },
        chat: { stop: 'Detener', visual_likes: 'Likes' },
        social: { cards: {} },
        many: { history: 'Chats' },
      },
    );

    expect(merged.chat).toMatchObject({
      tab: 'Chat',
      stop: 'Detener',
      visual_likes: 'Likes',
    });
    expect(merged.history).toBe('Historial');
  });
});
