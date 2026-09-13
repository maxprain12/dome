import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INSTAGRAM_PUBLIC_REDIRECT_URI,
  DOME_FACEBOOK_APP_ID,
  DOME_INSTAGRAM_APP_ID,
  assertPublicRedirectReachable,
  assertInstagramOAuthClientId,
  buildAuthUrl,
  decodeSocialOAuthState,
  encodeSocialOAuthState,
  instagramCodeExchangeFields,
  looksLikeInstagramTokenPayload,
  INSTAGRAM_CODE_EXCHANGE_URLS,
  registeredRedirectUri,
  sanitizeOauthCode,
} from '../social/social-oauth.cjs';

describe('social OAuth Instagram public bounce', () => {
  it('registers the HTTPS landing URI for Instagram and loopback for others', () => {
    assert.equal(
      registeredRedirectUri('instagram', 8737),
      'https://dome.dowi.es/oauth/instagram/callback',
    );
    assert.equal(registeredRedirectUri('instagram', 9999), INSTAGRAM_PUBLIC_REDIRECT_URI);
    assert.equal(registeredRedirectUri('linkedin', 8737), 'http://localhost:8737/callback/linkedin');
    assert.equal(registeredRedirectUri('x', 9001), 'http://localhost:9001/callback/x');
  });

  it('round-trips nonce and local port inside state', () => {
    const state = encodeSocialOAuthState('abcNonce', 9123);
    assert.equal(decodeSocialOAuthState(state).nonce, 'abcNonce');
    assert.equal(decodeSocialOAuthState(state).port, 9123);
  });

  it('falls back to 8737 for legacy raw nonce and out-of-range ports', () => {
    assert.equal(decodeSocialOAuthState('legacy-nonce').nonce, 'legacy-nonce');
    assert.equal(decodeSocialOAuthState('legacy-nonce').port, 8737);
    assert.equal(decodeSocialOAuthState(encodeSocialOAuthState('n', 80)).port, 8737);
    assert.equal(decodeSocialOAuthState('').nonce, '');
  });

  it('probes the bounce page and fails closed on 404', async () => {
    await assertPublicRedirectReachable('https://dome.dowi.es/oauth/instagram/callback', async () => ({
      ok: true,
      status: 200,
    }));
    await assert.rejects(
      () => assertPublicRedirectReachable('https://dome.dowi.es/oauth/instagram/callback', async () => ({
        ok: false,
        status: 404,
      })),
      /returned 404/,
    );
  });
});

describe('Instagram Business Login authorize URL', () => {
  it('hides Facebook Login and forces Instagram re-auth', () => {
    const url = new URL(buildAuthUrl(
      'instagram',
      DOME_INSTAGRAM_APP_ID,
      8737,
      'state-nonce',
      null,
      'instagram_business_basic,instagram_business_content_publish',
    ));
    assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), DOME_INSTAGRAM_APP_ID);
    assert.equal(url.searchParams.get('enable_fb_login'), '0');
    assert.equal(url.searchParams.get('force_reauth'), 'true');
    assert.equal(url.searchParams.get('response_type'), 'code');
  });

  it('rejects the parent Facebook App ID as Instagram client_id', () => {
    assert.throws(
      () => assertInstagramOAuthClientId(DOME_FACEBOOK_APP_ID),
      /Instagram App ID/,
    );
    assert.doesNotThrow(() => assertInstagramOAuthClientId(DOME_INSTAGRAM_APP_ID));
  });

  it('strips the Instagram #_ fragment leftover from the authorization code', () => {
    assert.equal(sanitizeOauthCode('AQBx-hBsH3...#_'), 'AQBx-hBsH3...');
    assert.equal(sanitizeOauthCode('AQBx-hBsH3...%23_'), 'AQBx-hBsH3...');
    assert.equal(sanitizeOauthCode('plain-code'), 'plain-code');
  });
});

describe('Instagram authorization code exchange', () => {
  it('posts client_id, secret, code and the public redirect URI', () => {
    const fields = instagramCodeExchangeFields({
      clientId: DOME_INSTAGRAM_APP_ID,
      clientSecret: 'ig-secret',
      redirectUri: INSTAGRAM_PUBLIC_REDIRECT_URI,
      code: 'AQBx-hBsH3...',
    });
    assert.equal(fields.grant_type, 'authorization_code');
    assert.equal(fields.client_id, DOME_INSTAGRAM_APP_ID);
    assert.equal(fields.redirect_uri, INSTAGRAM_PUBLIC_REDIRECT_URI);
    assert.equal(fields.code, 'AQBx-hBsH3...');
    assert.equal(looksLikeInstagramTokenPayload({ data: [{ access_token: 'IGAAA' }] }), true);
    assert.equal(looksLikeInstagramTokenPayload({ error_message: 'nope' }), false);
    assert.deepEqual(INSTAGRAM_CODE_EXCHANGE_URLS, [
      'https://api.instagram.com/oauth/access_token',
      'https://graph.instagram.com/oauth/access_token',
    ]);
  });
});
