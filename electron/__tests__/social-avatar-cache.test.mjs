import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isCachedAvatarUrl,
  preferredImageUrl,
  publicProfilePageUrl,
} = require('../social/social-avatar-cache.cjs');

describe('social avatar cache helpers', () => {
  it('prefers X 400px avatars and recognizes cached data URLs', () => {
    assert.equal(
      preferredImageUrl('https://pbs.twimg.com/profile_images/1/photo_normal.jpg'),
      'https://pbs.twimg.com/profile_images/1/photo_400x400.jpg',
    );
    assert.equal(isCachedAvatarUrl('data:image/jpeg;base64,abc'), true);
    assert.equal(isCachedAvatarUrl('https://example.com/a.jpg'), false);
  });

  it('builds public profile URLs from handles', () => {
    assert.equal(publicProfilePageUrl('instagram', '@dome_ia'), 'https://www.instagram.com/dome_ia/');
    assert.equal(publicProfilePageUrl('x', 'ada'), 'https://x.com/ada');
    assert.equal(publicProfilePageUrl('linkedin', 'ada'), null);
  });
});
