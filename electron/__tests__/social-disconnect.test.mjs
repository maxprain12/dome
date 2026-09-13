/**
 * Disconnecting a social account must drop that account's posts and metrics.
 * Run: node --experimental-sqlite --test electron/__tests__/social-disconnect.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

function buildQueries(db) {
  return {
    listSocialPostIdsByAccount: db.prepare('SELECT id FROM social_posts WHERE account_id = ?'),
    listUnlinkedSocialPostIds: db.prepare(`
      SELECT id FROM social_posts
      WHERE (account_id IS NOT NULL AND account_id NOT IN (SELECT id FROM social_accounts))
         OR (
           account_id IS NULL
           AND (created_by = 'import' OR status IN ('published', 'publishing', 'scheduled', 'failed'))
         )
    `),
    deleteSocialPost: db.prepare('DELETE FROM social_posts WHERE id = ?'),
    deleteSocialAccount: db.prepare('DELETE FROM social_accounts WHERE id = ?'),
    listSocialPosts: db.prepare(`
      SELECT p.* FROM social_posts p
      WHERE p.account_id IN (SELECT id FROM social_accounts)
         OR (p.account_id IS NULL AND IFNULL(p.created_by, 'user') != 'import' AND p.status = 'draft')
      ORDER BY COALESCE(p.scheduled_at, p.published_at, p.created_at) DESC LIMIT ?
    `),
    listRecentPublishedSocialPosts: db.prepare(`
      SELECT p.* FROM social_posts p
      INNER JOIN social_accounts a ON a.id = p.account_id
      WHERE p.status = 'published' AND p.published_at >= ?
      ORDER BY p.published_at DESC LIMIT ?
    `),
    countSocialPostsByStatus: db.prepare(`
      SELECT p.status, COUNT(*) AS c FROM social_posts p
      WHERE p.account_id IN (SELECT id FROM social_accounts)
         OR (p.account_id IS NULL AND IFNULL(p.created_by, 'user') != 'import' AND p.status = 'draft')
      GROUP BY p.status
    `),
    listSocialMetricsForPost: db.prepare(
      'SELECT * FROM social_metrics WHERE post_id = ? ORDER BY captured_at ASC',
    ),
    listLatestSocialMetrics: db.prepare(`
      SELECT m.* FROM social_metrics m
      JOIN (
        SELECT post_id, MAX(captured_at) AS max_at FROM social_metrics GROUP BY post_id
      ) latest ON latest.post_id = m.post_id AND latest.max_at = m.captured_at
      JOIN social_posts p ON p.id = m.post_id
      JOIN social_accounts a ON a.id = p.account_id
    `),
    listSocialAccountMetrics: db.prepare(`
      SELECT * FROM social_account_metrics WHERE account_id = ? AND captured_at >= ?
      ORDER BY captured_at ASC
    `),
    getSocialAccountById: db.prepare('SELECT * FROM social_accounts WHERE id = ?'),
    listSocialAccounts: db.prepare('SELECT * FROM social_accounts ORDER BY created_at ASC'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),
  };
}

describe('social disconnect deletes account-bound data', () => {
  let store;
  let memDb;
  let originalGetQueries;
  let originalGetDB;
  let database;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec('PRAGMA foreign_keys = ON');
    memDb.exec(`
      CREATE TABLE social_accounts (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, account_kind TEXT NOT NULL DEFAULT 'member',
        display_name TEXT, handle TEXT, external_id TEXT, credentials BLOB, scopes TEXT,
        status TEXT NOT NULL DEFAULT 'active', last_error TEXT, connected_at INTEGER,
        last_sync_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        cloud_publishing INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE social_posts (
        id TEXT PRIMARY KEY, account_id TEXT, provider TEXT NOT NULL, status TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '', media TEXT NOT NULL DEFAULT '[]',
        media_storage TEXT NOT NULL DEFAULT '[]', link_url TEXT, topics TEXT NOT NULL DEFAULT '[]',
        campaign TEXT, campaign_id TEXT, event_card_id TEXT, event_card_public_url TEXT,
        scheduled_at INTEGER, published_at INTEGER, external_post_id TEXT, external_url TEXT,
        error TEXT, notes TEXT, source_json TEXT, created_by TEXT NOT NULL DEFAULT 'user',
        group_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
      );
      CREATE TABLE social_metrics (
        id TEXT PRIMARY KEY, post_id TEXT NOT NULL, captured_at INTEGER NOT NULL,
        impressions INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
        clicks INTEGER, followers INTEGER, raw TEXT, updated_at INTEGER,
        FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
      );
      CREATE TABLE social_account_metrics (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, captured_at INTEGER NOT NULL,
        followers INTEGER, following INTEGER, posts_count INTEGER, raw TEXT, updated_at INTEGER,
        FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER
      );
    `);

    database = require('../core/database.cjs');
    originalGetQueries = database.getQueries;
    originalGetDB = database.getDB;
    database.getQueries = () => buildQueries(memDb);
    database.getDB = () => memDb;

    delete require.cache[require.resolve('../social/social-store.cjs')];
    const { createSocialStore } = require('../social/social-store.cjs');
    store = createSocialStore(database);
  });

  after(() => {
    database.getQueries = originalGetQueries;
    database.getDB = originalGetDB;
    memDb.close();
  });

  it('deleteAccount removes posts, post metrics and account metrics for that account only', () => {
    const now = Date.now();
    memDb.prepare(`
      INSERT INTO social_accounts (id, provider, display_name, handle, status, created_at, updated_at)
      VALUES (?, 'instagram', 'Keep', '@keep', 'active', ?, ?),
             (?, 'instagram', 'Drop', '@drop', 'active', ?, ?)
    `).run('acc-keep', now, now, 'acc-drop', now, now);

    memDb.prepare(`
      INSERT INTO social_posts (
        id, account_id, provider, status, body, published_at, external_post_id, created_by, created_at, updated_at
      ) VALUES
        ('sp-keep', 'acc-keep', 'instagram', 'published', 'stay', ?, 'ext-keep', 'import', ?, ?),
        ('sp-drop', 'acc-drop', 'instagram', 'published', 'gone', ?, 'ext-drop', 'import', ?, ?),
        ('sp-draft', 'acc-drop', 'instagram', 'draft', 'draft gone', NULL, NULL, 'user', ?, ?)
    `).run(now, now, now, now, now, now, now, now);

    memDb.prepare(`
      INSERT INTO social_metrics (id, post_id, captured_at, likes, updated_at) VALUES
        ('sm-keep', 'sp-keep', ?, 3, ?),
        ('sm-drop', 'sp-drop', ?, 9, ?)
    `).run(now, now, now, now);

    memDb.prepare(`
      INSERT INTO social_account_metrics (id, account_id, captured_at, followers, updated_at)
      VALUES ('sam-drop', 'acc-drop', ?, 100, ?), ('sam-keep', 'acc-keep', ?, 50, ?)
    `).run(now, now, now, now);

    memDb.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    `).run(
      'social_reply_drafts_v1',
      JSON.stringify([
        { id: 'srd-drop', accountId: 'acc-drop', replyBody: 'hi' },
        { id: 'srd-keep', accountId: 'acc-keep', replyBody: 'ok' },
      ]),
      now,
    );

    const result = store.deleteAccount('acc-drop');
    assert.ok(result.deletedPostIds.includes('sp-drop'));
    assert.ok(result.deletedPostIds.includes('sp-draft'));
    assert.equal(store.getAccount('acc-drop'), null);
    assert.ok(store.getAccount('acc-keep'));

    const remaining = store.listPosts({ limit: 50 });
    assert.deepEqual(remaining.map((post) => post.id), ['sp-keep']);
    assert.equal(memDb.prepare('SELECT COUNT(*) AS n FROM social_metrics').get().n, 1);
    assert.equal(memDb.prepare('SELECT COUNT(*) AS n FROM social_account_metrics').get().n, 1);
    assert.deepEqual(
      store.listReplyDrafts().map((draft) => draft.id),
      ['srd-keep'],
    );
    assert.equal(store.listRecentPublished({ sinceMs: 0, limit: 20 }).length, 1);
    assert.deepEqual(store.countPostsByStatus(), {
      draft: 0, scheduled: 0, publishing: 0, published: 1, failed: 0,
    });
  });

  it('hides leftover SET NULL posts and purges imported orphans', () => {
    const now = Date.now();
    memDb.prepare(`
      INSERT INTO social_posts (
        id, account_id, provider, status, body, published_at, created_by, created_at, updated_at
      ) VALUES
        ('sp-orphan', NULL, 'instagram', 'published', 'ghost', ?, 'import', ?, ?),
        ('sp-loose-draft', NULL, 'instagram', 'draft', 'unassigned', NULL, 'user', ?, ?)
    `).run(now, now, now, now, now);

    const listed = store.listPosts({ limit: 50 }).map((post) => post.id);
    assert.ok(listed.includes('sp-keep'));
    assert.ok(listed.includes('sp-loose-draft'));
    assert.equal(listed.includes('sp-orphan'), false);

    const purged = store.purgeUnlinkedPosts();
    assert.ok(purged.includes('sp-orphan'));
    assert.equal(purged.includes('sp-loose-draft'), false);
    assert.equal(memDb.prepare("SELECT id FROM social_posts WHERE id = 'sp-orphan'").get(), undefined);
    assert.ok(memDb.prepare("SELECT id FROM social_posts WHERE id = 'sp-loose-draft'").get());
  });
});
