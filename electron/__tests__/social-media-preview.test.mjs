/**
 * Social media still resolution for drafts/scheduled posts.
 * Run: node --test electron/__tests__/social-media-preview.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  looksLikeStoragePath,
  previewSocialMedia,
} = require('../social/social-media-preview.cjs');

describe('looksLikeStoragePath', () => {
  it('accepts contract paths and rejects traversal', () => {
    assert.equal(looksLikeStoragePath('social-media/u1/a.jpg'), true);
    assert.equal(looksLikeStoragePath('/social-media/u1/a.jpg'), true);
    assert.equal(looksLikeStoragePath('social-media/u1/../secret.jpg'), false);
    assert.equal(looksLikeStoragePath('https://cdn.example.test/a.jpg'), false);
  });
});

describe('previewSocialMedia', () => {
  it('returns null when the local file is missing', async () => {
    const result = await previewSocialMedia({}, { path: '/tmp/dome-missing-social-preview.jpg' });
    assert.deepEqual(result, { dataUrl: null, kind: null });
  });

  it('signs a storagePath when no local file exists', async () => {
    const result = await previewSocialMedia(
      {
        signMediaUrl: async (storagePath) => {
          assert.equal(storagePath, 'social-media/u1/a.jpg');
          return { publicUrl: 'https://cdn.example.test/signed.jpg' };
        },
      },
      { storagePath: 'social-media/u1/a.jpg' },
    );
    assert.deepEqual(result, { dataUrl: 'https://cdn.example.test/signed.jpg', kind: 'remote' });
  });

  it('prefers a local image thumbnail over signing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dome-social-preview-'));
    const filePath = path.join(dir, 'tiny.png');
    writeFileSync(filePath, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ));
    let signed = false;
    const result = await previewSocialMedia(
      {
        signMediaUrl: async () => {
          signed = true;
          return { publicUrl: 'https://cdn.example.test/should-not-use.jpg' };
        },
      },
      { path: filePath, storagePath: 'social-media/u1/a.jpg' },
    );
    assert.equal(signed, false);
    assert.equal(result.kind, 'image');
    assert.equal(typeof result.dataUrl, 'string');
    assert.match(result.dataUrl, /^data:image\//);
  });
});
