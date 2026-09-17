import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSocialUrl } = require('../social/social-url-parse.cjs');

describe('parseSocialUrl', () => {
  it('parses Instagram profiles and posts', () => {
    const profile = parseSocialUrl('https://www.instagram.com/dome.app/');
    assert.equal(profile.provider, 'instagram');
    assert.equal(profile.kind, 'profile');
    assert.equal(profile.handle, 'dome.app');
    const post = parseSocialUrl('https://instagram.com/p/AbC123/');
    assert.equal(post.kind, 'post');
    assert.equal(post.externalId, 'AbC123');
  });

  it('parses X profiles and statuses', () => {
    const profile = parseSocialUrl('https://x.com/dome');
    assert.equal(profile.provider, 'x');
    assert.equal(profile.kind, 'profile');
    const status = parseSocialUrl('https://twitter.com/dome/status/1234567890');
    assert.equal(status.kind, 'post');
    assert.equal(status.externalId, '1234567890');
    assert.equal(status.canonicalUrl, 'https://x.com/dome/status/1234567890');
  });

  it('parses LinkedIn profiles and activity', () => {
    const profile = parseSocialUrl('https://www.linkedin.com/in/ada-lovelace/');
    assert.equal(profile.kind, 'profile');
    const activity = parseSocialUrl('https://www.linkedin.com/feed/update/urn:li:activity:1');
    assert.equal(activity.kind, 'post');
  });

  it('rejects unsupported hosts', () => {
    assert.equal(parseSocialUrl('https://example.com/p/1'), null);
    assert.equal(parseSocialUrl('not-a-url'), null);
  });
});
