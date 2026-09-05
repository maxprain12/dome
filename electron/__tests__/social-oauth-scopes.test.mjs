import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { instagramScopes, xScopes } from '../social/social-oauth.cjs';

describe('social OAuth opt-in scopes', () => {
  it('keeps Instagram publish-only when messaging flags are off', () => {
    const scopes = instagramScopes({
      getMessagingCommentsEnabled: () => false,
      getMessagingDmEnabled: () => false,
    });
    assert.equal(scopes.includes('instagram_business_manage_comments'), false);
    assert.equal(scopes.includes('instagram_business_manage_messages'), false);
    assert.equal(scopes.includes('instagram_business_content_publish'), true);
  });

  it('adds Instagram comment/message scopes only when flags are on', () => {
    const scopes = instagramScopes({
      getMessagingCommentsEnabled: () => true,
      getMessagingDmEnabled: () => true,
    });
    assert.equal(scopes.includes('instagram_business_manage_comments'), true);
    assert.equal(scopes.includes('instagram_business_manage_messages'), true);
  });

  it('does not request X DM scopes without the opt-in flag', () => {
    const off = xScopes({ getMessagingDmEnabled: () => false });
    const on = xScopes({ getMessagingDmEnabled: () => true });
    assert.equal(off.includes('dm.write'), false);
    assert.equal(on.includes('dm.write'), true);
    assert.equal(on.includes('dm.read'), true);
  });

  it('does not add extra scopes when store helpers are missing', () => {
    assert.equal(instagramScopes(undefined).includes('manage_comments'), false);
    assert.equal(xScopes(undefined).includes('dm.write'), false);
  });
});
