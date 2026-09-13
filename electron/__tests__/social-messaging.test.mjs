import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accountSupports, nestComments, parseScopes } from '../social/social-messaging.cjs';

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

  it('allows IG listComments when any instagram_business scope is present', () => {
    assert.equal(
      accountSupports(
        {
          provider: 'instagram',
          scopes: 'instagram_business_basic,instagram_business_content_publish',
        },
        'listComments',
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

  it('blocks IG sendDm when stored scopes are empty', () => {
    assert.equal(
      accountSupports({ provider: 'instagram', scopes: null }, 'sendDm'),
      false,
    );
  });

  it('blocks sendDm when the opt-in flag is off even if scopes look right', () => {
    assert.equal(
      accountSupports(
        {
          provider: 'instagram',
          scopes: 'instagram_business_basic,instagram_business_manage_messages',
        },
        'sendDm',
        { dmEnabled: false },
      ),
      false,
    );
  });
});

describe('nestComments', () => {
  it('nests replies under the parent and keeps orphans as roots', () => {
    const nested = nestComments([
      { id: 'c2', text: 'reply', parentId: 'c1', createdAt: 2, authorName: 'ana' },
      { id: 'c1', text: 'root', parentId: null, createdAt: 1, authorName: 'max' },
      { id: 'c3', text: 'orphan', parentId: 'missing', createdAt: 3, authorName: 'leo' },
    ]);
    assert.equal(nested.length, 2);
    assert.equal(nested[0].id, 'c1');
    assert.equal(nested[0].replies.length, 1);
    assert.equal(nested[0].replies[0].id, 'c2');
    assert.equal(nested[1].id, 'c3');
  });

  it('merges a top-level copy with its nested reply and keeps a single thread', () => {
    const nested = nestComments([
      { id: 'c1', text: 'Info', parentId: null, createdAt: 1, authorName: 'mery_sugy' },
      { id: 'c2', text: 'Revisa tu DM', parentId: null, createdAt: 2, authorName: 'dome_ia' },
      { id: 'c2', text: 'Revisa tu DM', parentId: 'c1', createdAt: 2, authorName: null },
    ]);
    assert.equal(nested.length, 1);
    assert.equal(nested[0].id, 'c1');
    assert.equal(nested[0].replies.length, 1);
    assert.equal(nested[0].replies[0].id, 'c2');
    assert.equal(nested[0].replies[0].authorName, 'dome_ia');
    assert.equal(nested[0].replies[0].parentId, 'c1');
  });
});
