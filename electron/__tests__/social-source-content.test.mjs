import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { instagramContent, xContent } = require('../social/social-source-content.cjs');

describe('social source content', () => {
  it('keeps Instagram carousel media and presentation metadata', () => {
    const result = instagramContent(
      {
        id: 'ig-1',
        media_type: 'CAROUSEL_ALBUM',
        media_product_type: 'FEED',
        media_url: 'https://cdn.example.test/cover.jpg',
        children: {
          data: [
            { id: 'ig-1a', media_type: 'IMAGE', media_url: 'https://cdn.example.test/a.jpg' },
            { id: 'ig-1b', media_type: 'VIDEO', media_url: 'https://cdn.example.test/b.mp4', thumbnail_url: 'https://cdn.example.test/b.jpg' },
          ],
        },
      },
      { displayName: 'Dome', handle: 'dome' },
    );

    assert.equal(result.source.format, 'carousel');
    assert.deepEqual(result.media.map((item) => item.type), ['image', 'video']);
    assert.equal(result.media[1].thumbnailUrl, 'https://cdn.example.test/b.jpg');
  });

  it('keeps Instagram location, people tags and original audio on import', () => {
    const result = instagramContent(
      {
        id: 'ig-2',
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        media_url: 'https://cdn.example.test/reel.mp4',
        thumbnail_url: 'https://cdn.example.test/reel.jpg',
        username: 'dome',
        location: { id: '55', name: 'Bilbao' },
        user_tags: [{ username: 'ana' }],
        collaborators: [{ username: 'studio' }],
        media_audio_type: 'MUSIC',
      },
      { displayName: 'Dome', handle: 'dome' },
    );
    assert.equal(result.source.format, 'reel');
    assert.equal(result.media[0].type, 'reel');
    assert.equal(result.media[0].thumbnailUrl, 'https://cdn.example.test/reel.jpg');
    assert.equal(result.source.location.name, 'Bilbao');
    assert.equal(result.source.userTags[0].username, 'ana');
    assert.deepEqual(result.source.collaborators, ['studio']);
    assert.equal(result.source.audioType, 'MUSIC');
  });

  it('joins X media, poll, link and quote expansions into one display payload', () => {
    const result = xContent(
      {
        id: 'x-1',
        text: 'See this',
        author_id: 'u-1',
        attachments: { media_keys: ['m-1'], poll_ids: ['poll-1'] },
        entities: { urls: [{ expanded_url: 'https://example.test/article', unwound_url: 'https://example.test/article' }] },
        referenced_tweets: [{ type: 'quoted', id: 'x-2' }],
      },
      {
        users: [{ id: 'u-1', name: 'Dome', username: 'dome' }, { id: 'u-2', name: 'Ana', username: 'ana' }],
        media: [{ media_key: 'm-1', type: 'photo', url: 'https://cdn.example.test/post.jpg', alt_text: 'Studio' }],
        polls: [{ id: 'poll-1', options: [{ position: 1, label: 'Sí', votes: 4 }] }],
        tweets: [{ id: 'x-2', text: 'Quoted text', author_id: 'u-2' }],
      },
      { handle: 'dome' },
    );

    assert.equal(result.media[0].alt, 'Studio');
    assert.equal(result.linkUrl, 'https://example.test/article');
    assert.equal(result.source.poll.options[0].votes, 4);
    assert.equal(result.source.quote.authorHandle, 'ana');
  });
});
