import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { creatorEvidencePack } = require('../social/social-creator-evidence.cjs');

it('analyzes the entire saved period and reports the actual bounded sample', () => {
  const posts = Array.from({ length: 500 }, (_, index) => ({
    kind: 'post', url: `https://x.com/ada/status/${index}`, publishedAt: 1800000000000 - index * 86400000,
  }));
  const pack = creatorEvidencePack(posts, { member: { handle: 'ada' } });
  assert.equal(pack.coverage.savedPosts, 500);
  assert.equal(pack.coverage.analyzedPosts, 120);
  assert.equal(pack.posts[0].url, posts[0].url);
  assert.equal(pack.posts.at(-1).url, posts.at(-1).url);
  assert.equal(new Set(pack.posts.map((post) => post.url)).size, 120);
  assert.equal(pack.coverage.oldestPublishedAt, posts.at(-1).publishedAt);
  assert.equal(pack.coverage.completeHistory, false);
  assert.ok(pack.limitations.includes('partial_history'));
});

it('does not confuse capture dates with publication dates', () => {
  const pack = creatorEvidencePack([{ kind: 'post', capturedAt: Date.now() }], { member: {} });
  assert.equal(pack.coverage.oldestPublishedAt, null);
  assert.equal(pack.coverage.undatedPosts, 1);
});
