/**
 * people-store unit tests (node:sqlite — no better-sqlite3 native rebuild needed).
 * Run: node --experimental-sqlite --test electron/__tests__/people-store.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { loadCjsModule } from './helpers/load-cjs.mjs';

const require = createRequire(import.meta.url);

describe('people-store', () => {
  let peopleStore;
  let memDb;

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
        lead_status TEXT NOT NULL DEFAULT 'lead',
        profile_json TEXT,
        discovered_via TEXT,
        first_seen_at INTEGER,
        last_seen_at INTEGER,
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
      CREATE TABLE person_interactions (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        kind TEXT NOT NULL,
        ref_type TEXT,
        ref_id TEXT,
        summary TEXT,
        payload TEXT,
        occurred_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      );
    `);

    peopleStore = loadCjsModule(require.resolve('../people/people-store.cjs'), {
      '../core/database.cjs': { getDB: () => memDb },
      '../search/source-index.cjs': { upsertDocument() {}, removeDocument() {} },
      '../storage/sync-tombstone.cjs': {},
    });
  });

  after(() => {
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

  it('deletePerson removes person, identities and interactions', () => {
    const person = peopleStore.upsertIdentityPerson({
      projectId: 'proj-del',
      source: 'email',
      externalId: 'spam@example.com',
      displayName: 'Spam',
    });
    peopleStore.addInteraction({
      personId: person.id,
      projectId: 'proj-del',
      kind: 'note',
      summary: 'junk',
    });
    const result = peopleStore.deletePerson(person.id);
    assert.equal(result.deleted, true);
    assert.equal(peopleStore.getPerson(person.id), null);
    assert.equal(peopleStore.searchPeople('proj-del', 'spam@example.com').length, 0);
    assert.equal(peopleStore.deletePerson(person.id).deleted, false);
  });

  it('accepts website identity and merges profile on upsert', () => {
    const person = peopleStore.upsertPerson({
      projectId: 'proj-web',
      displayName: 'Mery',
      profile: { occupation: 'Founder' },
    });
    const linked = peopleStore.linkIdentity({
      personId: person.id,
      projectId: 'proj-web',
      source: 'website',
      externalId: 'https://www.erpsigpyme.com/',
      displayLabel: 'ERP Sigpyme',
    });
    assert.equal(linked.conflict, false);
    assert.equal(linked.linked, true);
    const again = peopleStore.upsertPerson({
      id: person.id,
      projectId: 'proj-web',
      displayName: 'Mery',
      profile: { website: 'https://www.erpsigpyme.com', phone: '555' },
    });
    assert.equal(again.profile.occupation, 'Founder');
    assert.equal(again.profile.website, 'https://www.erpsigpyme.com');
    assert.equal(again.identities[0].source, 'website');
    assert.equal(again.identities[0].externalId, 'www.erpsigpyme.com');
  });

  it('ingestPeople creates leads from a document and aliases url → website', () => {
    const result = peopleStore.ingestPeople({
      projectId: 'proj-doc',
      sourceResourceId: 'res-pdf-1',
      sourceKind: 'document',
      summary: 'Leads from kickoff PDF',
      people: [
        {
          display_name: 'Ada Voice',
          primary_email: 'ada@example.com',
          profile: { occupation: 'CEO', company: 'Voice Co' },
          identities: [{ source: 'url', external_id: 'https://voice.co' }],
        },
      ],
    });
    assert.equal(result.count, 1);
    assert.equal(result.people[0].displayName, 'Ada Voice');
    assert.equal(result.people[0].profile.company, 'Voice Co');
    assert.equal(result.people[0].identities[0].source, 'website');
    assert.equal(result.people[0].interactions.length, 1);
    assert.equal(result.people[0].interactions[0].refId, 'res-pdf-1');
  });

  it('deletePeople deletes many', () => {
    const a = peopleStore.upsertPerson({ projectId: 'proj-bulk', displayName: 'A' });
    const b = peopleStore.upsertPerson({ projectId: 'proj-bulk', displayName: 'B' });
    const result = peopleStore.deletePeople([a.id, b.id, 'missing']);
    assert.equal(result.deleted, 2);
    assert.equal(result.requested, 3);
    assert.equal(peopleStore.listPeople('proj-bulk').length, 0);
  });

  it('persists builtin and custom lead statuses and filters by them', () => {
    peopleStore.upsertPerson({ projectId: 'proj-st', displayName: 'Pat', leadStatus: 'partner' });
    peopleStore.upsertPerson({ projectId: 'proj-st', displayName: 'Val', leadStatus: 'VIP Club' });
    peopleStore.upsertPerson({ projectId: 'proj-st', displayName: 'Old', leadStatus: '!!!' });
    const partners = peopleStore.listPeople('proj-st', { leadStatus: 'partner' });
    assert.equal(partners.length, 1);
    assert.equal(partners[0].displayName, 'Pat');
    const vips = peopleStore.listPeople('proj-st', { leadStatus: 'vip_club' });
    assert.equal(vips.length, 1);
    assert.equal(vips[0].leadStatus, 'vip_club');
    const fallback = peopleStore.listPeople('proj-st').find((p) => p.displayName === 'Old');
    assert.equal(fallback.leadStatus, 'lead');
    assert.equal(peopleStore.normalizePersonStatus('Inversor ángel'), 'inversor_angel');
  });
  it('reuses a unique exact primary email in the same project and preserves curated fields', () => {
    const person = peopleStore.upsertPerson({ projectId: 'match', displayName: 'Curated Name', primaryEmail: 'Contact@Example.com', avatarUrl: 'curated.png' });
    const imported = peopleStore.upsertIdentityPerson({ projectId: 'match', source: 'email', externalId: 'contact@example.com', displayName: 'Remote Name', avatarUrl: 'remote.png' });
    assert.equal(imported.id, person.id);
    assert.equal(imported.displayName, 'Curated Name');
    assert.equal(imported.avatarUrl, 'curated.png');
    assert.equal(imported.identities.length, 1);
    const other = peopleStore.upsertIdentityPerson({ projectId: 'other-match', source: 'email', externalId: 'contact@example.com' });
    assert.notEqual(other.id, person.id);
  });

  it('does not overwrite a manually edited name or primary address during identity refresh', () => {
    const person = peopleStore.upsertIdentityPerson({ projectId: 'curated', source: 'email', externalId: 'old@example.com' });
    peopleStore.updateProfile({ id: person.id, displayName: 'My contact', primaryEmail: 'new@example.com' });
    const updated = peopleStore.upsertIdentityPerson({ projectId: 'curated', source: 'email', externalId: 'old@example.com', displayName: 'Old Name', primaryEmail: 'old@example.com' });
    assert.equal(updated.displayName, 'My contact');
    assert.equal(updated.primaryEmail, 'new@example.com');
  });

  it('refuses ambiguous primary email matches without creating another contact', () => {
    for (const displayName of ['A', 'B']) peopleStore.upsertPerson({ projectId: 'ambiguous', displayName, primaryEmail: 'shared@example.com' });
    assert.throws(() => peopleStore.upsertIdentityPerson({ projectId: 'ambiguous', source: 'email', externalId: 'shared@example.com' }), /Multiple contacts/);
    assert.equal(peopleStore.listPeople('ambiguous').length, 2);
  });

  it('rejects cross-project person updates and interactions', () => {
    const person = peopleStore.upsertPerson({ projectId: 'owned', displayName: 'Original' });
    assert.throws(() => peopleStore.upsertPerson({ id: person.id, projectId: 'foreign', displayName: 'Changed' }), /project/);
    assert.throws(() => peopleStore.addInteraction({ personId: person.id, projectId: 'foreign', kind: 'note', summary: 'Wrong vault' }), /project/);
    assert.equal(peopleStore.getPerson(person.id).displayName, 'Original');
  });

  it('applies the status filter before the search limit', () => {
    for (let n = 0; n < 55; n += 1) peopleStore.upsertPerson({ projectId: 'search-status', displayName: `Contact ${n}`, leadStatus: 'lead' });
    const expected = peopleStore.upsertPerson({ projectId: 'search-status', displayName: 'Contact Z', leadStatus: 'client' });
    const matches = peopleStore.searchPeople('search-status', 'Contact', { leadStatus: 'client', limit: 1 });
    assert.deepEqual(matches.map((p) => p.id), [expected.id]);
  });

});
