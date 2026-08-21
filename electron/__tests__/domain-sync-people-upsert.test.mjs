/**
 * Ensure people UPSERT does not CASCADE-wipe identities (REPLACE would).
 * Run: node --experimental-sqlite --test electron/__tests__/domain-sync-people-upsert.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

describe('domain-sync people upsert', () => {
  let domainSync;
  let memDb;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        lead_status TEXT NOT NULL DEFAULT 'lead',
        profile_json TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE person_identities (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        display_label TEXT,
        meta_json TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      );
    `);
    memDb
      .prepare(
        `INSERT INTO people (id, display_name, profile_json, updated_at)
         VALUES ('person_1', '@ad.vo2', '{}', 1)`,
      )
      .run();
    memDb
      .prepare(
        `INSERT INTO person_identities
          (id, person_id, source, external_id, display_label, meta_json, updated_at)
         VALUES ('pident_1', 'person_1', 'social_instagram', 'ad.vo2', '@ad.vo2', '{}', 1)`,
      )
      .run();

    delete require.cache[require.resolve('../storage/domain-sync.cjs')];
    domainSync = require('../storage/domain-sync.cjs');
  });

  after(() => {
    memDb.close();
  });

  it('updating people row keeps identities', () => {
    const apply =
      domainSync.DOMAIN_SPECS?.people?.tables?.[0]?.applyRow ||
      domainSync.__test?.applyPeopleRow;
    assert.ok(typeof apply === 'function', 'people applyRow exported for test');

    apply(memDb, {
      id: 'person_1',
      project_id: 'default',
      display_name: 'Ada Voice',
      avatar_url: 'https://cdn.example/a.jpg',
      lead_status: 'lead',
      profile_json: { instagram_username: 'ad.vo2' },
      updated_at: 2,
    });

    const person = memDb.prepare(`SELECT display_name FROM people WHERE id = 'person_1'`).get();
    assert.equal(person.display_name, 'Ada Voice');
    const identity = memDb
      .prepare(`SELECT id FROM person_identities WHERE person_id = 'person_1'`)
      .get();
    assert.ok(identity, 'identity must survive people upsert');
  });

  it('person_identities natural-key conflict adopts remote id', () => {
    const applyIdentity = domainSync.DOMAIN_SPECS?.people?.tables?.[1]?.applyRow;
    assert.ok(typeof applyIdentity === 'function');

    applyIdentity(memDb, {
      id: 'pident_cloud',
      person_id: 'person_1',
      project_id: 'default',
      source: 'social_instagram',
      external_id: 'ad.vo2',
      display_label: '@ad.vo2',
      meta_json: { username: 'ad.vo2' },
      updated_at: 3,
    });

    const rows = memDb
      .prepare(
        `SELECT id FROM person_identities
         WHERE project_id = 'default' AND source = 'social_instagram' AND external_id = 'ad.vo2'`,
      )
      .all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'pident_cloud');
  });
});
