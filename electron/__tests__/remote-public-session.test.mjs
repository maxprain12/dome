import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { toPublicMessages } = require('../remote/public-session.cjs');

describe('remote-many public session', () => {
  it('turns toolResult rows into activity + profile visual, not JSON dumps', () => {
    const messages = toPublicMessages(
      [
        { role: 'user', content: 'analiza este perfil' },
        { role: 'assistant', content: 'Voy a resolver el perfil público.' },
        {
          role: 'toolResult',
          toolName: 'social_public_resolve',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                card: {
                  kind: 'profile',
                  provider: 'instagram',
                  body: 'The AI workspace that works while you sleep.',
                  url: 'https://www.instagram.com/notionhq/',
                  followers: 489632,
                  postsCount: 355,
                  author: {
                    name: 'Notion',
                    handle: 'notionhq',
                    avatarUrl: 'https://cdn.example/n.jpg',
                  },
                },
              }),
            },
          ],
        },
        { role: 'assistant', content: 'Análisis: @notionhq vs DomeIA' },
      ],
      'thread-1',
    );
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[1].role, 'assistant');
    assert.equal(messages[2].role, 'activity');
    assert.deepEqual(messages[2].steps, ['Perfil público']);
    assert.equal(messages[3].role, 'visual');
    assert.equal(messages[3].visual.name, 'Notion');
    assert.equal(messages[3].visual.avatarUrl, 'https://cdn.example/n.jpg');
    assert.equal(messages[4].role, 'assistant');
    assert.equal(messages.some((row) => String(row.text).includes('success')), false);
  });
});
