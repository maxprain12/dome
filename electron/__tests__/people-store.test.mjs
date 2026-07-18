/**
 * people-store unit tests (node:sqlite — no better-sqlite3 native rebuild needed).
 * Run: node --experimental-sqlite --test electron/__tests__/people-store.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);

describe('people-store', () => {
  let peopleStore;
  let memDb;
  let originalGetDB;

  before(() => {
    memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        display_name TEXT NOT NULL,
        primary_email TEXT,
        avatar_url TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
        UNIQUE(project_id, source, external_id)
      );
    `);

    const database = require('../core/database.cjs');
    originalGetDB = database.getDB;
    database.getDB = () => memDb;
    delete require.cache[require.resolve('../people/people-store.cjs')];
    peopleStore = require('../people/people-store.cjs');
  });

  after(() => {
    const database = require('../core/database.cjs');
    database.getDB = originalGetDB;
    memDb.close();
  });

  it('normalizeExternalId strips @ and lowercases github', () => {
    assert.equal(peopleStore.normalizeExternalId('github', '@MaxPrain'), 'maxprain');
    assert.equal(peopleStore.normalizeExternalId('email', 'A@B.com'), 'a@b.com');
  });

  it('upsertIdentityPerson creates person + identity; search finds by login', () => {
    const person = peopleStore.upsertIdentityPerson({
      projectId: 'proj-a',
      source: 'github',
      externalId: '@maxprain',
      displayName: 'Max',
    });
    assert.ok(person.id);
    assert.equal(person.displayName, 'Max');
    assert.equal(person.identities.length, 1);
    assert.equal(person.identities[0].externalId, 'maxprain');
    assert.equal(person.identities[0].source, 'github');

    const hits = peopleStore.searchPeople('proj-a', 'max');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, person.id);

    const again = peopleStore.upsertIdentityPerson({
      projectId: 'proj-a',
      source: 'github',
      externalId: 'maxprain',
      displayName: 'Max Prain',
    });
    assert.equal(again.id, person.id);
  });

  it('linkIdentity conflict does not merge different people', () => {
    const a = peopleStore.upsertPerson({ projectId: 'proj-a', displayName: 'Alice' });
    const b = peopleStore.upsertPerson({ projectId: 'proj-a', displayName: 'Bob' });
    peopleStore.linkIdentity({
      personId: a.id,
      projectId: 'proj-a',
      source: 'email',
      externalId: 'shared@example.com',
    });
    const result = peopleStore.linkIdentity({
      personId: b.id,
      projectId: 'proj-a',
      source: 'email',
      externalId: 'shared@example.com',
    });
    assert.equal(result.conflict, true);
    assert.equal(result.person.id, a.id);
  });

  it('two identities can attach to one person', () => {
    const person = peopleStore.upsertIdentityPerson({
      projectId: 'proj-b',
      source: 'github',
      externalId: 'alder',
      displayName: 'Alder',
    });
    peopleStore.linkIdentity({
      personId: person.id,
      projectId: 'proj-b',
      source: 'email',
      externalId: 'alder@example.com',
    });
    const full = peopleStore.getPerson(person.id);
    assert.equal(full.identities.length, 2);
    assert.equal(full.primaryEmail, 'alder@example.com');
    const byEmail = peopleStore.searchPeople('proj-b', 'alder@example.com');
    assert.equal(byEmail[0].id, person.id);
  });
});
