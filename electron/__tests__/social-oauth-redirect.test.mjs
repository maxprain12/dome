import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INSTAGRAM_PUBLIC_REDIRECT_URI,
  assertPublicRedirectReachable,
  decodeSocialOAuthState,
  encodeSocialOAuthState,
  registeredRedirectUri,
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
