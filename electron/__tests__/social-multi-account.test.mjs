import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadModule(relativePath, replacements) {
  const filename = require.resolve(relativePath);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(
    (name) => replacements[name] ?? localRequire(name), module, module.exports,
  );
  return module.exports;
}

function fixture() {
  const accounts = [
    { id: 'ig-a', provider: 'instagram', status: 'active' },
    { id: 'ig-b', provider: 'instagram', status: 'active' },
  ];
  const posts = [
    { id: 'post-a', accountId: 'ig-a', provider: 'instagram', status: 'published', externalPostId: 'external-a', body: 'A' },
    { id: 'post-b', accountId: 'ig-b', provider: 'instagram', status: 'published', externalPostId: 'external-b', body: 'B' },
  ];
  const calls = [];
  const store = {
    getAccount: (id) => accounts.find((account) => account.id === id),
    serializeAccount: (account) => account,
    listAccounts: () => accounts,
    getPost: (id) => posts.find((post) => post.id === id),
    markPostFailed: (id, error) => { const post = store.getPost(id); post.status = 'failed'; post.error = error; return post; },
    markPostPublishing: (id) => calls.push(['publishing', id]),
    markPostPublished: (id) => store.getPost(id),
    listRecentPublished: () => posts,
    getLatestAccountMetric: () => null,
    insertAccountMetric: (id) => calls.push(['account-metric', id]),
    insertMetric: (id) => calls.push(['post-metric', id]),
    getLatestMetric: () => ({}),
    upsertImportedPost: (post) => { calls.push(['import', post.accountId]); return { created: true }; },
    deleteAccount: (id) => {
      const deletedPostIds = posts.filter((post) => post.accountId === id).map((post) => post.id);
      for (const postId of deletedPostIds) {
        const index = posts.findIndex((post) => post.id === postId);
        if (index >= 0) posts.splice(index, 1);
      }
      const accountIndex = accounts.findIndex((account) => account.id === id);
      if (accountIndex >= 0) accounts.splice(accountIndex, 1);
      return { deletedPostIds };
    },
    purgeUnlinkedPosts: () => [],
  };
  const provider = {
    publishPost: async (_, post) => { calls.push(['publish', post.accountId]); return {}; },
    fetchAccountMetrics: async (_, account) => { calls.push(['fetch-account', account.id]); return { followers: 10 }; },
    fetchPostMetrics: async (_, post) => { calls.push(['fetch-post', post.accountId]); return { likes: 2 }; },
    listRecentPosts: async (_, account) => { calls.push(['feed', account.id]); return { posts: [{ externalPostId: 'imported' }] }; },
  };
  const { createSocialService } = loadModule('../social/social-service.cjs', {
    './social-store.cjs': { createSocialStore: () => store, PROVIDERS: ['instagram'] },
    './social-oauth.cjs': { createSocialOAuth: () => ({}) },
    './social-calendar-bridge.cjs': { syncPostEvent: async () => {}, removePostEvent: async () => {} },
    './providers/instagram.cjs': provider,
    '../people/people-store.cjs': { findPersonByIdentity: () => null },
  });
  const service = createSocialService({ getQueries: () => ({ touchSocialAccountSync: { run: () => {} } }) });
  return { service, accounts, posts, calls, provider };
}

describe('Social account boundaries', () => {
  it('publishes only to the explicit account, including the second Instagram account', async () => {
    const { service, posts, calls } = fixture();
    posts[1].status = 'draft';
    await service.publishPost('post-b');
    assert.deepEqual(calls.filter(([action]) => action === 'publish'), [['publish', 'ig-b']]);
  });

  it('never falls back for missing, disconnected, expired or wrong-network accounts', async () => {
    for (const accountId of [null, 'deleted', 'ig-a']) {
      const { service, posts, accounts, calls } = fixture();
      posts[0].status = 'draft';
      posts[0].accountId = accountId;
      accounts[0].status = 'expired';
      await assert.rejects(service.publishPost('post-a'), /account/);
      assert.equal(calls.length, 0);
      assert.equal(posts[0].status, 'failed');
    }
    const { service, posts, accounts } = fixture();
    posts[0].status = 'draft';
    accounts[0].provider = 'x';
    await assert.rejects(service.publishPost('post-a'), /another network/);
  });

  it('syncs feed and metrics only for the selected account', async () => {
    const { service, calls } = fixture();
    const result = await service.syncPlatformFeed({ accountId: 'ig-b' });
    assert.equal(result.imported, 1);
    assert.equal(result.accounts[0].accountId, 'ig-b');
    assert.equal(calls.some(([, id]) => id === 'ig-a' || id === 'post-a'), false);
    assert.ok(calls.some(([action]) => action === 'fetch-post'));
  });

  it('keeps successful imports and reports the failed account', async () => {
    const { service, provider } = fixture();
    provider.listRecentPosts = async (_, account) => {
      if (account.id === 'ig-a') throw new Error('Permission denied');
      return { posts: [{ externalPostId: 'imported' }] };
    };
    const result = await service.syncPlatformFeed();
    assert.equal(result.imported, 1);
    assert.equal(result.accounts[0].error, 'Permission denied');
    assert.equal(result.accounts[1].imported, 1);
  });

  it('skips metrics for posts without a live account', async () => {
    const { service, posts, calls } = fixture();
    posts[0].accountId = null;
    await service.refreshAllMetrics();
    assert.equal(calls.some(([, id]) => id === 'post-a' || id == null), false);
    assert.ok(calls.some(([action, id]) => action === 'fetch-post' && id === 'ig-b'));
  });

  it('disconnect drops that account’s posts and stops requesting its metrics', async () => {
    const { service, accounts, posts, calls } = fixture();
    service.disconnect('ig-a');
    assert.equal(accounts.some((account) => account.id === 'ig-a'), false);
    assert.equal(posts.some((post) => post.accountId === 'ig-a'), false);
    await service.refreshAllMetrics();
    assert.equal(calls.some(([, id]) => id === 'ig-a' || id === 'post-a'), false);
  });

  it('rejects a missing sync target and avoids other accounts for comments', async () => {
    const { service, posts } = fixture();
    await assert.rejects(service.syncPlatformFeed({ accountId: 'deleted' }), /unavailable/);
    posts[0].accountId = 'deleted';
    const result = await service.listPostComments({ postId: 'post-a' });
    assert.equal(result.reason, 'no_account');
  });
});

it('connects two Instagram identities and reconnects only the matching account', async () => {
  const { connectWithToken } = require('../social/providers/instagram.cjs');
  const rows = [];
  const store = {
    listAccounts: () => rows,
    getAccount: (id) => rows.find((row) => row.id === id),
    serializeAccount: ({ tokens: _tokens, ...account }) => account,
    createAccount: (input) => { const row = { ...input, id: `account-${rows.length}` }; rows.push(row); return row; },
    updateAccountTokens: (id, tokens) => { store.getAccount(id).tokens = tokens; },
    updateAccountProfile: (id, profile) => Object.assign(store.getAccount(id), profile),
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => ({ ok: true, text: async () => {
      const token = new URL(url).searchParams.get('access_token');
      if (token === 'invalid') return '{}';
      return JSON.stringify({ user_id: token.startsWith('a') ? '1' : '2', username: token });
    } });
    const a = await connectWithToken(store, { accessToken: 'a1' });
    const b = await connectWithToken(store, { accessToken: 'b1' });
    const again = await connectWithToken(store, { accessToken: 'a2' });
    assert.notEqual(a.id, b.id);
    assert.equal(again.id, a.id);
    assert.equal(rows.length, 2);
    assert.equal(store.getAccount(b.id).tokens.access_token, 'b1');
    assert.equal(store.getAccount(a.id).tokens.access_token, 'a2');
    assert.equal('tokens' in a, false);
    await assert.rejects(connectWithToken(store, { accessToken: 'invalid' }), /identity/);
    assert.equal(rows.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
