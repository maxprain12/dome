import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accountSupports, parseScopes } from '../social/social-messaging.cjs';

describe('social-messaging accountSupports', () => {
  it('parses comma and space scopes', () => {
    const set = parseScopes('tweet.read dm.write,offline.access');
    assert.equal(set.has('tweet.read'), true);
    assert.equal(set.has('dm.write'), true);
    assert.equal(set.has('offline.access'), true);
  });

  it('allows IG sendDm when scopes include manage_messages', () => {
    assert.equal(
      accountSupports(
        {
          provider: 'instagram',
          scopes: 'instagram_business_basic,instagram_business_manage_messages',
        },
        'sendDm',
      ),
      true,
    );
  });

  it('allows X listComments with tweet.read', () => {
    assert.equal(
      accountSupports({ provider: 'x', scopes: 'tweet.read tweet.write' }, 'listComments'),
      true,
    );
  });

  it('blocks X sendDm without dm.write', () => {
    assert.equal(
      accountSupports({ provider: 'x', scopes: 'tweet.read tweet.write' }, 'sendDm'),
      false,
    );
  });
});
