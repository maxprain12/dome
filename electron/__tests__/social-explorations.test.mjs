import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  refreshSuggestions,
  dueScheduledExplorations,
  queueThemeExplorations,
} = require('../social/social-explorations.cjs');

function mockService({ posts = [], references = [], drafts = [], members = [], recipes = null, pending = [] } = {}) {
  const suggestions = [...pending];
  return {
    store: {
      listAccounts: () => [{ handle: 'me', provider: 'instagram' }],
      listPosts: () => posts,
      listReplyDrafts: () => drafts,
    },
    references: {
      listReferences: () => references,
      ensureDefaultWatchlists: () => [{
        kind: 'inspiration',
        members,
      }],
      listWatchlists: () => [{ kind: 'inspiration', members }],
      listSuggestions: ({ status = 'pending' } = {}) => suggestions.filter((row) => row.status === status),
      upsertSuggestion: (input) => {
        const existing = suggestions.find((row) => row.profileUrl === input.profileUrl && row.provider === input.provider);
        if (existing && (existing.status === 'dismissed' || existing.status === 'accepted')) return existing;
        if (existing) {
          Object.assign(existing, input);
          return existing;
        }
        const row = {
          ...input,
          id: `scs-${suggestions.length + 1}`,
          status: 'pending',
          createdAt: Date.now(),
        };
        suggestions.push(row);
        return row;
      },
      latestExploration: () => null,
      createExploration: (input) => ({ id: `sxp-${Date.now()}`, ...input, payload: null }),
      updateExploration: (id, patch) => ({ id, ...patch }),
    },
    database: {
      getQueries: () => ({
        getSetting: {
          get: () => (recipes ? { value: JSON.stringify(recipes) } : null),
        },
      }),
    },
    suggestions,
  };
}

describe('social creator suggestions and exploration cadence', () => {
  it('suggests a public profile that shares a hashtag from your posts', () => {
    const service = mockService({
      posts: [{ status: 'published', topics: ['growth'], body: 'Shipping #growth' }],
      references: [{
        kind: 'profile',
        provider: 'instagram',
        url: 'https://www.instagram.com/other/',
        title: 'Other',
        author: { name: 'Other', handle: 'other' },
        topics: ['growth'],
      }],
    });
    const listed = refreshSuggestions(service, { projectId: 'default' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reason, 'hashtag');
    assert.equal(listed[0].reasonDetail, '#growth');
  });

  it('suggests comment authors and skips your own handle', () => {
    const service = mockService({
      drafts: [
        { commentAuthor: 'me', provider: 'instagram', commentText: 'own' },
        { commentAuthor: 'ada', provider: 'instagram', commentText: 'love this reel' },
      ],
    });
    const listed = refreshSuggestions(service, { projectId: 'default' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reason, 'comment');
    assert.equal(listed[0].handle, 'ada');
  });

  it('caps new suggestions at five per network per week', () => {
    const pending = Array.from({ length: 5 }, (_, index) => ({
      id: `scs-old-${index}`,
      provider: 'instagram',
      profileUrl: `https://www.instagram.com/old${index}/`,
      status: 'pending',
      createdAt: Date.now(),
    }));
    const service = mockService({
      pending,
      references: [{
        kind: 'profile',
        provider: 'instagram',
        url: 'https://www.instagram.com/newone/',
        title: 'New',
        author: { name: 'New', handle: 'newone' },
      }],
    });
    refreshSuggestions(service, { projectId: 'default' });
    assert.equal(service.suggestions.filter((row) => row.profileUrl.includes('newone')).length, 0);
  });

  it('skips scheduled explorations when cadence is manual', () => {
    const service = mockService({
      members: [{ personId: 'p-1', handle: 'ada' }],
      recipes: {
        inspiration: [{ id: 'formats', enabled: true, cadence: 'manual' }],
      },
    });
    const due = dueScheduledExplorations(service, { projectId: 'default' });
    assert.equal(due.length, 0);
  });

  it('queues weekly recipes when nothing has run yet', () => {
    const service = mockService({
      members: [{ personId: 'p-1', handle: 'ada' }],
      recipes: {
        inspiration: [{ id: 'formats', enabled: true, cadence: 'weekly' }],
      },
    });
    const due = dueScheduledExplorations(service, { projectId: 'default' });
    assert.equal(due.length, 1);
    assert.equal(due[0].recipeId, 'formats');
    assert.equal(due[0].personId, 'p-1');
  });

  it('queues theme explorations for watchlist members with matching evidence', () => {
    const service = mockService({
      members: [{ personId: 'p-1', handle: 'ada', displayName: 'Ada' }],
      references: [{
        kind: 'post',
        url: 'https://www.instagram.com/p/1/',
        title: 'Ada reel',
        body: 'Shipping #growth',
        topics: ['growth'],
        author: { handle: 'ada' },
      }],
    });
    const result = queueThemeExplorations(service, { projectId: 'default', theme: 'growth' });
    assert.equal(result.queued, 1);
    assert.equal(result.creators[0].personId, 'p-1');
  });

  it('does not invent creators when a theme has no matching evidence', () => {
    const service = mockService({
      members: [{ personId: 'p-1', handle: 'ada' }],
      references: [],
    });
    const result = queueThemeExplorations(service, { projectId: 'default', theme: 'unrelated' });
    assert.equal(result.queued, 0);
  });
});
