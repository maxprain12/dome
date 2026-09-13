/**
 * Instagram publish helpers — carousel plan and Dome Provider URL mapping.
 * Run: node --test electron/__tests__/instagram-publish.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseMediaUploadResponse,
  mapSocialMediaUploadError,
  assertInstagramReachableUrl,
  planInstagramPublish,
  toPublicPublishItems,
} = require('../social/instagram-publish.cjs');

describe('parseMediaUploadResponse', () => {
  it('keeps storagePath and prefers publicUrl', () => {
    assert.deepEqual(
      parseMediaUploadResponse({
        storagePath: 'social-media/u1/a.jpg',
        publicUrl: 'https://cdn.example.test/a.jpg',
        url: 'https://other.example.test/a.jpg',
      }),
      { storagePath: 'social-media/u1/a.jpg', publicUrl: 'https://cdn.example.test/a.jpg' },
    );
  });

  it('rejects a response without storagePath', () => {
    assert.throws(() => parseMediaUploadResponse({ publicUrl: 'https://cdn.example.test/a.jpg' }), /missing_storage_path/);
  });
});

describe('mapSocialMediaUploadError', () => {
  it('maps provider auth and plan errors', () => {
    assert.match(mapSocialMediaUploadError(401, '{"error":"unauthorized"}'), /Sign in to Dome/);
    assert.match(mapSocialMediaUploadError(403, '{"error":"feature_not_in_plan"}'), /Social Cloud/);
    assert.match(mapSocialMediaUploadError(503, '{"error":"sync_unavailable"}'), /unavailable/);
  });
});

describe('assertInstagramReachableUrl', () => {
  it('accepts public https and rejects localhost', () => {
    assert.doesNotThrow(() => assertInstagramReachableUrl('https://cdn.example.test/p.jpg'));
    assert.throws(() => assertInstagramReachableUrl('http://cdn.example.test/p.jpg'), /https/);
    assert.throws(() => assertInstagramReachableUrl('https://localhost:3001/p.jpg'), /local URL/);
  });
});

describe('planInstagramPublish', () => {
  it('uses a single photo, a reel, or a carousel of every item', () => {
    assert.equal(
      planInstagramPublish([{ url: 'https://cdn.example.test/1.jpg', mediaKind: 'image' }]).mode,
      'image',
    );
    assert.equal(
      planInstagramPublish([{ url: 'https://cdn.example.test/1.mp4', mediaKind: 'video' }]).mode,
      'reel',
    );
    const carousel = planInstagramPublish([
      { url: 'https://cdn.example.test/1.jpg', mediaKind: 'image' },
      { url: 'https://cdn.example.test/2.jpg', mediaKind: 'image' },
      { url: 'https://cdn.example.test/3.jpg', mediaKind: 'image' },
      { url: 'https://cdn.example.test/4.jpg', mediaKind: 'image' },
    ]);
    assert.equal(carousel.mode, 'carousel');
    assert.equal(carousel.items.length, 4);
  });

  it('rejects more than 10 items', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      url: `https://cdn.example.test/${i}.jpg`,
      mediaKind: 'image',
    }));
    assert.throws(() => planInstagramPublish(items), /at most 10/);
  });
});

describe('toPublicPublishItems', () => {
  it('uploads files without dropping the original source identity', async () => {
    const sources = [
      { kind: 'url', url: 'https://cdn.example.test/public.jpg', mediaKind: 'image' },
      { kind: 'file', path: '/tmp/local.jpg', mime: 'image/jpeg', mediaKind: 'image', resourceId: 'res-1' },
    ];
    const { items, storagePaths } = await toPublicPublishItems(sources, async (filePath, mime) => {
      assert.equal(filePath, '/tmp/local.jpg');
      assert.equal(mime, 'image/jpeg');
      return {
        storagePath: 'social-media/u1/local.jpg',
        publicUrl: 'https://cdn.example.test/signed.jpg',
      };
    });
    assert.deepEqual(items, [
      { url: 'https://cdn.example.test/public.jpg', mediaKind: 'image' },
      { url: 'https://cdn.example.test/signed.jpg', mediaKind: 'image' },
    ]);
    assert.deepEqual(storagePaths, [null, 'social-media/u1/local.jpg']);
    assert.equal(sources[1].resourceId, 'res-1');
    assert.equal(sources[1].path, '/tmp/local.jpg');
  });
});
