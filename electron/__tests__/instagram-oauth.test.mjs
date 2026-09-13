/**
 * Instagram Login OAuth payload helpers.
 * Run: node --test electron/__tests__/instagram-oauth.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeInstagramTokenResponse,
  isUnsupportedHttpMethodError,
  isFetchNetworkError,
  wrapInstagramGraphError,
  buildInstagramProfile,
} = require('../social/providers/instagram.cjs');

describe('normalizeInstagramTokenResponse', () => {
  it('reads the official { data: [{ access_token, user_id, permissions }] } payload', () => {
    const normalized = normalizeInstagramTokenResponse({
      data: [
        {
          access_token: 'IGAAA-short',
          user_id: '178414000',
          permissions: 'instagram_business_basic,instagram_business_content_publish',
        },
      ],
    });
    assert.equal(normalized.accessToken, 'IGAAA-short');
    assert.equal(normalized.userId, '178414000');
    assert.equal(
      normalized.permissions,
      'instagram_business_basic,instagram_business_content_publish',
    );
  });

  it('still accepts a flat token response', () => {
    const normalized = normalizeInstagramTokenResponse({
      access_token: 'flat-token',
      user_id: 1020,
      permissions: ['instagram_business_basic'],
    });
    assert.equal(normalized.accessToken, 'flat-token');
    assert.equal(normalized.userId, '1020');
    assert.equal(normalized.permissions, 'instagram_business_basic');
  });
});

describe('buildInstagramProfile', () => {
  it('uses Graph /me fields when present', () => {
    const profile = buildInstagramProfile(
      { user_id: '178414000', username: 'ad.vo2', name: 'Ad Vo', followers_count: 12 },
      null,
    );
    assert.deepEqual(profile, {
      externalId: '178414000',
      displayName: 'Ad Vo',
      handle: '@ad.vo2',
      followers: 12,
    });
  });

  it('falls back to the token user id when Graph /me is unavailable', () => {
    const profile = buildInstagramProfile(null, '178414000');
    assert.equal(profile.externalId, '178414000');
    assert.equal(profile.displayName, 'Instagram');
    assert.equal(profile.handle, null);
  });

  it('unwraps the { data: [{ user_id, username }] } Graph /me payload', () => {
    const profile = buildInstagramProfile(
      { data: [{ user_id: '178414000', username: 'ad.vo2', name: 'Ad Vo' }] },
      null,
    );
    assert.equal(profile.externalId, '178414000');
    assert.equal(profile.handle, '@ad.vo2');
    assert.equal(profile.displayName, 'Ad Vo');
  });
});

describe('isUnsupportedHttpMethodError', () => {
  it('matches Instagram code 100 GET/POST rejections', () => {
    assert.equal(
      isUnsupportedHttpMethodError(new Error('Instagram API 400: Unsupported request - method type: get')),
      true,
    );
    assert.equal(isUnsupportedHttpMethodError(new Error('rate limited')), false);
  });
});

describe('isFetchNetworkError', () => {
  it('matches undici timeouts and aborts', () => {
    const timedOut = new Error('fetch failed');
    timedOut.cause = { code: 'ETIMEDOUT' };
    assert.equal(isFetchNetworkError(timedOut), true);
    assert.equal(isFetchNetworkError(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
    assert.equal(isFetchNetworkError(new Error('Instagram API 400: boom')), false);
  });
});

describe('wrapInstagramGraphError', () => {
  it('adds an actionable hint and stays idempotent', () => {
    const wrapped = wrapInstagramGraphError(
      new Error('Instagram API 400: Unsupported request - method type: get'),
    );
    assert.match(wrapped.message, /Instagram Testers/);
    assert.match(wrapped.message, /method type: get/);
    assert.equal(wrapInstagramGraphError(wrapped), wrapped);
  });
});
