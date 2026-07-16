/**
 * source-index FTS tests (node:sqlite).
 * Run: node --experimental-sqlite --test electron/__tests__/source-index.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

describe('source-index', () => {
  let sourceIndex;
  let memDb;
  let originalGetDB;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE source_documents (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        title TEXT,
        body TEXT,
        meta_json TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE source_documents_fts USING fts5(
        doc_id UNINDEXED,
        title,
        body
      );
    `);
    const database = require('../core/database.cjs');
    originalGetDB = database.getDB;
    database.getDB = () => memDb;
    delete require.cache[require.resolve('../search/source-index.cjs')];
    sourceIndex = require('../search/source-index.cjs');
  });

  after(() => {
    const database = require('../core/database.cjs');
    database.getDB = originalGetDB;
    memDb.close();
  });

  it('indexes issue and finds by title via FTS', () => {
    sourceIndex.upsertDocument({
      kind: 'issue',
      sourceId: 'iss-1',
      projectId: 'p1',
      title: '#12 Fix login flow',
      body: 'Broken OAuth redirect',
      meta: { number: 12 },
    });
    const hits = sourceIndex.searchDocuments('"login"', { projectId: 'p1' });
    assert.ok(hits.some((h) => h.kind === 'issue' && h.id === 'iss-1'));
  });

  it('indexes email subject without requiring body', () => {
    sourceIndex.upsertDocument({
      kind: 'email',
      sourceId: 'em-1',
      projectId: 'p1',
      title: 'Quarterly invoice',
      body: 'from:billing@acme.com',
    });
    const hits = sourceIndex.searchDocuments('"invoice"', { projectId: 'p1' });
    assert.ok(hits.some((h) => h.kind === 'email'));
  });

  it('caps results per kind', () => {
    for (let i = 0; i < 10; i += 1) {
      sourceIndex.upsertDocument({
        kind: 'person',
        sourceId: `person-${i}`,
        projectId: 'p1',
        title: `Alice ${i}`,
        body: 'alice collaborator',
      });
    }
    const hits = sourceIndex.searchDocuments('"alice"', {
      projectId: 'p1',
      limitPerKind: 5,
    });
    const people = hits.filter((h) => h.kind === 'person');
    assert.ok(people.length <= 5);
  });

  it('finds Spanish issue titles via LIKE fallback when FTS query misses', () => {
    sourceIndex.upsertDocument({
      kind: 'issue',
      sourceId: 'iss-mejoras',
      projectId: 'p1',
      title: '#450 Mejoras de dome- Arreglar el panel de estudiar.',
      body: '',
      meta: { number: 450, state: 'open', repoId: 'repo-1', fullName: 'acme/dome' },
    });
    // Force LIKE path: empty FTS query string + rawTerms
    const hits = sourceIndex.searchDocuments('', {
      projectId: 'p1',
      rawTerms: ['mejoras'],
    });
    assert.ok(hits.some((h) => h.kind === 'issue' && h.id === 'iss-mejoras'));
  });

  it('searchSocialDirect does not reference nonexistent project_id columns', () => {
    memDb.exec(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        handle TEXT,
        display_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        body TEXT,
        topics TEXT,
        link_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const now = Date.now();
    memDb
      .prepare(
        `INSERT INTO social_accounts (id, provider, handle, status, created_at, updated_at)
         VALUES ('acc-1', 'x', 'dome', 'active', ?, ?)`,
      )
      .run(now, now);
    memDb
      .prepare(
        `INSERT INTO social_posts (id, account_id, provider, body, topics, status, created_at, updated_at)
         VALUES ('post-1', 'acc-1', 'x', 'Launch announcement for Dome', 'product launch', 'published', ?, ?)`,
      )
      .run(now, now);

    const hits = sourceIndex.searchSocialDirect(['launch'], 'any-project');
    assert.ok(hits.some((h) => h.kind === 'social_post' && h.id === 'post-1'));
    assert.equal(hits[0]?.projectId, 'default');

    const n = sourceIndex.indexSocialPosts();
    assert.ok(n >= 1);
    const fts = sourceIndex.searchDocuments('"Launch"', { projectId: 'default' });
    assert.ok(fts.some((h) => h.kind === 'social_post' && h.id === 'post-1'));
  });
});
