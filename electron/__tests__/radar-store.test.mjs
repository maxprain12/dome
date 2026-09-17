import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { createRadarStore } = require('../social/radar/radar-store.cjs');

function openDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE social_reference_metrics (
      id TEXT PRIMARY KEY,
      reference_id TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      likes INTEGER,
      comments INTEGER,
      shares INTEGER,
      impressions INTEGER,
      saves INTEGER,
      metrics_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE social_radar_cluster_cache (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      feed TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE social_interest_profile (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      evidence_json TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, topic_key)
    );
    CREATE TABLE social_trend_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      cluster_id TEXT,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE social_trend_attributions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      cluster_id TEXT NOT NULL,
      draft_id TEXT,
      post_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const queries = {
    insertSocialReferenceMetric: db.prepare(`
      INSERT INTO social_reference_metrics (
        id, reference_id, captured_at, likes, comments, shares, impressions, saves, metrics_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    listSocialReferenceMetrics: db.prepare(
      'SELECT * FROM social_reference_metrics WHERE reference_id = ? ORDER BY captured_at DESC LIMIT ?',
    ),
    getLatestSocialReferenceMetric: db.prepare(
      'SELECT * FROM social_reference_metrics WHERE reference_id = ? ORDER BY captured_at DESC LIMIT 1',
    ),
    upsertSocialRadarClusterCache: db.prepare(`
      INSERT INTO social_radar_cluster_cache (
        id, project_id, feed, topic_key, payload_json, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, expires_at = excluded.expires_at, updated_at = excluded.updated_at
    `),
    listSocialRadarClusterCache: db.prepare(
      'SELECT * FROM social_radar_cluster_cache WHERE project_id = ? AND feed = ? AND expires_at > ?',
    ),
    getSocialRadarClusterCache: db.prepare('SELECT * FROM social_radar_cluster_cache WHERE id = ?'),
    deleteExpiredSocialRadarClusterCache: db.prepare('DELETE FROM social_radar_cluster_cache WHERE expires_at <= ?'),
    getSocialInterestProfile: db.prepare(
      'SELECT * FROM social_interest_profile WHERE project_id = ? AND topic_key = ?',
    ),
    listSocialInterestProfile: db.prepare(
      'SELECT * FROM social_interest_profile WHERE project_id = ? ORDER BY weight DESC',
    ),
    upsertSocialInterestProfile: db.prepare(`
      INSERT INTO social_interest_profile (id, project_id, topic_key, weight, evidence_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, topic_key) DO UPDATE SET
        weight = excluded.weight, evidence_json = excluded.evidence_json, updated_at = excluded.updated_at
    `),
    insertSocialTrendEvent: db.prepare(`
      INSERT INTO social_trend_events (id, project_id, cluster_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    listSocialTrendEvents: db.prepare(
      'SELECT * FROM social_trend_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
    ),
    insertSocialTrendAttribution: db.prepare(`
      INSERT INTO social_trend_attributions (id, project_id, cluster_id, draft_id, post_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    listSocialTrendAttributions: db.prepare(
      'SELECT * FROM social_trend_attributions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
    ),
  };
  return { db, store: createRadarStore({ getQueries: () => queries }) };
}

describe('radar store', () => {
  it('snapshots reference metrics only when they change', () => {
    const { db, store } = openDb();
    const first = store.snapshotReferenceMetrics('sr-1', { likes: 4, impressions: 100 });
    const same = store.snapshotReferenceMetrics('sr-1', { likes: 4, impressions: 100 });
    const next = store.snapshotReferenceMetrics('sr-1', { likes: 9, impressions: 180 });
    assert.ok(first);
    assert.equal(same, null);
    assert.ok(next);
    assert.equal(store.listReferenceMetricSeries('sr-1').length, 2);
    const eventId = store.recordEvent({
      projectId: 'default',
      clusterId: 'radar:local:ai',
      eventType: 'open',
      payload: { topicKey: 'ai' },
    });
    assert.ok(eventId.startsWith('ste-'));
    store.upsertInterest('default', 'ai', 0.8, ['watchlist']);
    assert.equal(store.listInterest('default')[0].topicKey, 'ai');
    db.close();
  });
});
