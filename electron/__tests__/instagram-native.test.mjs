/**
 * Instagram native publish/import helpers.
 * Run: node --test electron/__tests__/instagram-native.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyNativePublishParams,
  nativeSourceFromGraph,
  parseFacebookPlaceQuery,
  isUnknownFieldError,
} = require('../social/instagram-native.cjs');

describe('instagram native publish params', () => {
  it('adds location, people tags, collaborators and reel audio name', () => {
    const params = applyNativePublishParams(
      { image_url: 'https://cdn.example.test/p.jpg', caption: 'Hi' },
      {
        location: { id: '111', name: 'Madrid' },
        userTags: [{ username: '@ana', x: 0.2, y: 0.8 }],
        collaborators: ['dome', 'studio'],
      },
      { isVideo: false },
    );
    assert.equal(params.location_id, '111');
    assert.equal(params.user_tags, JSON.stringify([{ username: 'ana', x: 0.2, y: 0.8 }]));
    assert.equal(params.collaborators, JSON.stringify(['dome', 'studio']));
    assert.equal(params.audio_name, undefined);

    const reel = applyNativePublishParams(
      { media_type: 'REELS', video_url: 'https://cdn.example.test/r.mp4' },
      { userTags: [{ username: 'ana' }], audioName: 'Original audio' },
      { isVideo: true },
    );
    assert.equal(reel.user_tags, JSON.stringify([{ username: 'ana' }]));
    assert.equal(reel.audio_name, 'Original audio');
  });

  it('puts location and collaborators on the carousel parent, not children', () => {
    const child = applyNativePublishParams(
      { image_url: 'https://cdn.example.test/1.jpg', is_carousel_item: true },
      {
        location: { id: '111', name: 'Madrid' },
        userTags: [{ username: 'ana', x: 0.2, y: 0.8 }],
        collaborators: ['dome'],
      },
      { isCarouselItem: true, isVideo: false },
    );
    assert.equal(child.location_id, undefined);
    assert.equal(child.collaborators, undefined);
    assert.equal(child.user_tags, JSON.stringify([{ username: 'ana', x: 0.2, y: 0.8 }]));

    const parent = applyNativePublishParams(
      { media_type: 'CAROUSEL', children: '1,2', caption: 'Hi' },
      {
        location: { id: '111', name: 'Madrid' },
        userTags: [{ username: 'ana' }],
        collaborators: ['dome'],
      },
      { isCarouselParent: true },
    );
    assert.equal(parent.location_id, '111');
    assert.equal(parent.collaborators, JSON.stringify(['dome']));
    assert.equal(parent.user_tags, undefined);
  });
});

describe('instagram native import mapping', () => {
  it('keeps place name, tags, collaborators and audio type from Graph', () => {
    const source = nativeSourceFromGraph({
      location: { id: '99', name: 'Valencia' },
      user_tags: [{ username: 'maria', x: 0.4, y: 0.6 }],
      collaborators: [{ username: 'dome' }],
      media_audio_type: 'ORIGINAL_SOUND',
      audio_name: 'Studio take',
    });
    assert.deepEqual(source.location, { id: '99', name: 'Valencia' });
    assert.equal(source.userTags[0].username, 'maria');
    assert.deepEqual(source.collaborators, ['dome']);
    assert.equal(source.audioType, 'ORIGINAL_SOUND');
    assert.equal(source.audioName, 'Studio take');
  });

  it('parses Facebook place URLs and unknown-field errors', () => {
    assert.equal(parseFacebookPlaceQuery('https://www.facebook.com/pages/Plaza-Mayor/123456789'), '123456789');
    assert.equal(parseFacebookPlaceQuery('https://facebook.com/PlazaMayor'), 'PlazaMayor');
    assert.equal(parseFacebookPlaceQuery('not a url'), null);
    assert.equal(isUnknownFieldError(new Error('(#100) Tried accessing nonexisting field (location)')), true);
    assert.equal(isUnknownFieldError(new Error('Instagram API 500: boom')), false);
  });
});
