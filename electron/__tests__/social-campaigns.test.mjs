/**
 * social campaigns store (node:sqlite).
 * Run: node --experimental-sqlite --test electron/__tests__/social-campaigns.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

function buildSocialQueries(db) {
  return {
    createSocialCampaign: db.prepare(`
      INSERT INTO social_campaigns (id, name, goal, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getSocialCampaignById: db.prepare('SELECT * FROM social_campaigns WHERE id = ?'),
    getSocialCampaignByName: db.prepare('SELECT * FROM social_campaigns WHERE name = ?'),
    updateSocialCampaign: db.prepare(`
      UPDATE social_campaigns SET name = ?, goal = ?, status = ?, updated_at = ? WHERE id = ?
    `),
    listSocialCampaigns: db.prepare(`
      SELECT * FROM social_campaigns ORDER BY
        CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
    `),
    listSocialCampaignsByStatus: db.prepare(`
      SELECT * FROM social_campaigns WHERE status = ? ORDER BY updated_at DESC
    `),
    countSocialPostsByCampaignId: db.prepare(`
      SELECT status, COUNT(*) AS c FROM social_posts WHERE campaign_id = ? GROUP BY status
    `),
    createSocialPost: db.prepare(`
      INSERT INTO social_posts (
        id, account_id, provider, status, body, media, link_url, topics, campaign, campaign_id,
        scheduled_at, published_at, external_post_id, external_url, error, created_by, group_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSocialPostById: db.prepare('SELECT * FROM social_posts WHERE id = ?'),
  };
}

describe('social campaigns store', () => {
  let store;
  let memDb;
  let originalGetQueries;
  let originalGetDB;
  let database;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE social_campaigns (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, goal TEXT,
        status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE social_posts (
        id TEXT PRIMARY KEY, account_id TEXT, provider TEXT NOT NULL, status TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '', media TEXT NOT NULL DEFAULT '[]',
        media_storage TEXT NOT NULL DEFAULT '[]', link_url TEXT, topics TEXT NOT NULL DEFAULT '[]',
        campaign TEXT, campaign_id TEXT, scheduled_at INTEGER, published_at INTEGER,
        external_post_id TEXT, external_url TEXT, error TEXT, created_by TEXT NOT NULL DEFAULT 'user',
        group_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `);

    database = require('../core/database.cjs');
    originalGetQueries = database.getQueries;
    originalGetDB = database.getDB;
    const queries = buildSocialQueries(memDb);
    database.getQueries = () => queries;
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

  it('creates campaign and links posts by campaignId', () => {
    const campaign = store.createCampaign({ name: 'Launch', goal: 'Grow IG' });
    assert.ok(campaign.id.startsWith('scamp-'));
    assert.equal(campaign.name, 'Launch');
    assert.equal(campaign.goal, 'Grow IG');

    const post = store.createPost({
      provider: 'instagram',
      body: 'Hello',
      campaignId: campaign.id,
    });
    assert.equal(post.campaignId, campaign.id);
    assert.equal(post.campaign, 'Launch');

    const listed = store.listCampaigns({ status: 'active' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].draft, 1);
  });

  it('createPost with campaign string backfills campaign row', () => {
    const post = store.createPost({
      provider: 'linkedin',
      body: 'Hiring',
      campaign: 'Hiring Q3',
    });
    assert.ok(post.campaignId);
    assert.equal(post.campaign, 'Hiring Q3');
    const again = store.createCampaign({ name: 'Hiring Q3' });
    assert.equal(again.id, post.campaignId);
  });
});
