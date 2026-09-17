/**
 * social references store (node:sqlite).
 * Run: node --experimental-sqlite --test electron/__tests__/social-references.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

function buildQueries(db) {
  return {
    insertSocialReference: db.prepare(`
      INSERT INTO social_references (
        id, project_id, provider, external_url, external_post_id, person_id, resource_id,
        title, body, format, topics_json, media_json, metrics_json, source_json, source_kind,
        limitations_json, captured_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateSocialReference: db.prepare(`
      UPDATE social_references SET
        person_id = ?, resource_id = ?, title = ?, body = ?, format = ?, topics_json = ?,
        media_json = ?, metrics_json = ?, source_json = ?, source_kind = ?, limitations_json = ?,
        captured_at = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `),
    getSocialReferenceById: db.prepare('SELECT * FROM social_references WHERE id = ?'),
    getSocialReferenceByUrl: db.prepare('SELECT * FROM social_references WHERE project_id = ? AND external_url = ?'),
    listSocialReferences: db.prepare('SELECT * FROM social_references WHERE project_id = ? ORDER BY captured_at DESC LIMIT ?'),
    deleteSocialReference: db.prepare('DELETE FROM social_references WHERE id = ?'),
    insertSocialCollection: db.prepare(`
      INSERT INTO social_collections (id, project_id, name, description, kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    listSocialCollections: db.prepare('SELECT * FROM social_collections WHERE project_id = ? ORDER BY updated_at DESC'),
    addSocialCollectionItem: db.prepare(`
      INSERT OR REPLACE INTO social_collection_items (collection_id, reference_id, position, added_at)
      VALUES (?, ?, ?, ?)
    `),
    removeSocialCollectionItem: db.prepare(
      'DELETE FROM social_collection_items WHERE collection_id = ? AND reference_id = ?',
    ),
    listSocialCollectionItems: db.prepare(
      'SELECT reference_id FROM social_collection_items WHERE collection_id = ? ORDER BY position ASC, added_at ASC',
    ),
    insertSocialWatchlist: db.prepare(`
      INSERT INTO social_watchlists (id, project_id, name, kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    listSocialWatchlists: db.prepare('SELECT * FROM social_watchlists WHERE project_id = ? ORDER BY updated_at DESC'),
    getSocialWatchlistById: db.prepare('SELECT * FROM social_watchlists WHERE id = ?'),
    upsertSocialWatchlistMember: db.prepare(`
      INSERT INTO social_watchlist_members (
        watchlist_id, person_id, role, notes, handle, provider, profile_url, avatar_url, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(watchlist_id, person_id) DO UPDATE SET
        role = excluded.role, notes = excluded.notes, handle = excluded.handle,
        provider = excluded.provider, profile_url = excluded.profile_url,
        avatar_url = excluded.avatar_url, display_name = excluded.display_name, updated_at = excluded.updated_at
    `),
    listSocialWatchlistMembers: db.prepare('SELECT * FROM social_watchlist_members WHERE watchlist_id = ? ORDER BY updated_at DESC'),
    deleteSocialWatchlistMember: db.prepare(
      'DELETE FROM social_watchlist_members WHERE watchlist_id = ? AND person_id = ?',
    ),
    insertSocialCampaignReference: db.prepare(`
      INSERT OR IGNORE INTO social_campaign_references (campaign_id, reference_id, notes, created_at)
      VALUES (?, ?, ?, ?)
    `),
    deleteSocialCampaignReference: db.prepare(
      'DELETE FROM social_campaign_references WHERE campaign_id = ? AND reference_id = ?',
    ),
    listSocialCampaignReferenceIds: db.prepare(
      'SELECT reference_id FROM social_campaign_references WHERE campaign_id = ? ORDER BY created_at DESC',
    ),
    insertSocialTrendSnapshot: db.prepare(`
      INSERT INTO social_trend_snapshots (id, project_id, period_days, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    listSocialTrendSnapshots: db.prepare(
      'SELECT * FROM social_trend_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
    ),
  };
}

describe('social reference store', () => {
  let store;
  let memDb;
  let originalGetQueries;
  let originalGetDB;
  let database;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE social_references (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', provider TEXT NOT NULL,
        external_url TEXT NOT NULL, external_post_id TEXT, person_id TEXT, resource_id TEXT,
        title TEXT, body TEXT, format TEXT, topics_json TEXT, media_json TEXT, metrics_json TEXT,
        source_json TEXT, source_kind TEXT NOT NULL DEFAULT 'manual', limitations_json TEXT,
        captured_at INTEGER NOT NULL, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(project_id, external_url)
      );
      CREATE TABLE social_collections (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL,
        description TEXT, kind TEXT NOT NULL DEFAULT 'inspiration', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE social_collection_items (
        collection_id TEXT NOT NULL, reference_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL, PRIMARY KEY (collection_id, reference_id)
      );
      CREATE TABLE social_watchlists (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL,
        kind TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE social_watchlist_members (
        watchlist_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT, notes TEXT, handle TEXT,
        provider TEXT, profile_url TEXT, avatar_url TEXT, display_name TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (watchlist_id, person_id)
      );
      CREATE TABLE social_campaign_references (
        campaign_id TEXT NOT NULL, reference_id TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL,
        PRIMARY KEY (campaign_id, reference_id)
      );
      CREATE TABLE social_trend_snapshots (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT 'default', period_days INTEGER NOT NULL,
        payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE sync_tombstones (
        table_name TEXT NOT NULL, row_id TEXT NOT NULL, deleted_at INTEGER NOT NULL, synced_at INTEGER,
        PRIMARY KEY (table_name, row_id)
      );
    `);
    database = require('../core/database.cjs');
    originalGetQueries = database.getQueries;
    originalGetDB = database.getDB;
    database.getQueries = () => buildQueries(memDb);
    database.getDB = () => memDb;
    delete require.cache[require.resolve('../social/social-reference-store.cjs')];
    store = require('../social/social-reference-store.cjs').createSocialReferenceStore(database);
  });

  after(() => {
    database.getQueries = originalGetQueries;
    database.getDB = originalGetDB;
    memDb.close();
  });

  it('dedupes captures by canonical URL', () => {
    const first = store.capture({
      url: 'https://www.instagram.com/p/AbC123/',
      card: { provider: 'instagram', kind: 'post', url: 'https://www.instagram.com/p/AbC123/', author: { name: 'Ada' }, body: 'one' },
    });
    const second = store.capture({
      url: 'https://instagram.com/p/AbC123/?igsh=1',
      card: { provider: 'instagram', kind: 'post', url: 'https://www.instagram.com/p/AbC123/', author: { name: 'Ada' }, body: 'two' },
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.reference.body, 'two');
    assert.equal(store.listReferences({ projectId: 'default' }).length, 1);
  });

  it('persists post likes and publishedAt for filters', () => {
    const publishedAt = Date.parse('September 16, 2025');
    const { reference } = store.capture({
      url: 'https://www.instagram.com/p/Metrics1/',
      card: {
        provider: 'instagram',
        kind: 'post',
        url: 'https://www.instagram.com/p/Metrics1/',
        author: { name: 'Ada', handle: 'ada' },
        body: 'hook',
        metrics: { likes: 105, comments: 8 },
        publishedAt,
      },
    });
    assert.equal(reference.metrics.likes, 105);
    assert.equal(reference.publishedAt, publishedAt);
  });

  it('groups references in collections and watchlists', () => {
    const { reference } = store.capture({ url: 'https://x.com/ada/status/1', card: { provider: 'x', kind: 'post', url: 'https://x.com/ada/status/1', author: { name: 'Ada', handle: 'ada' } } });
    const collection = store.createCollection({ name: 'Hooks', kind: 'inspiration' });
    store.addToCollection(collection.id, reference.id);
    assert.deepEqual(store.listCollections({ projectId: 'default' })[0].itemIds, [reference.id]);
    const watchlist = store.createWatchlist({ name: 'Rivals', kind: 'competitor' });
    store.addWatchlistMember(watchlist.id, { handle: 'ada', provider: 'x', displayName: 'Ada Lovelace' });
    const listed = store.listWatchlists({ projectId: 'default' }).find((item) => item.id === watchlist.id);
    assert.equal(listed.members[0].displayName, 'Ada Lovelace');
    store.linkCampaignReference('camp-1', reference.id);
    assert.equal(store.listCampaignReferences('camp-1')[0].id, reference.id);
  });

  it('fills a watchlist avatar from the captured profile when the member row is empty', () => {
    store.capture({
      url: 'https://www.instagram.com/manychat/',
      card: {
        provider: 'instagram',
        kind: 'profile',
        url: 'https://www.instagram.com/manychat/',
        author: { name: 'manychat', handle: 'manychat', avatarUrl: 'https://scontent.cdninstagram.com/v/t51.2885-19/logo.jpg' },
      },
    });
    const watchlist = store.createWatchlist({ name: 'Inspiration', kind: 'inspiration' });
    store.addWatchlistMember(watchlist.id, {
      handle: 'manychat',
      provider: 'instagram',
      profileUrl: 'https://www.instagram.com/manychat/',
      displayName: 'manychat',
    });
    const listed = store.listWatchlists({ projectId: 'default' }).find((item) => item.id === watchlist.id);
    assert.equal(listed.members[0].avatarUrl, 'https://scontent.cdninstagram.com/v/t51.2885-19/logo.jpg');
  });
});
