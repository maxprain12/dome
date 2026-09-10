import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { createCaptureService } = require('../browser-extension/capture-service.cjs');

function createFakeDb(seed = {}) {
  const projects = seed.projects || [{ id: 'default', name: 'Default' }];
  const resources = new Map(Object.entries(seed.resources || {}));
  const settings = new Map([['last_project_id', 'default']]);
  return {
    getQueries: () => ({
      getSetting: { get: (key) => (settings.has(key) ? { value: settings.get(key) } : undefined) },
      getProjects: { all: () => projects },
      getProjectById: { get: (id) => projects.find((p) => p.id === id) },
      getResourcesByProject: { all: (pid) => [...resources.values()].filter((r) => r.project_id === pid) },
      getResourceById: { get: (id) => resources.get(id) },
      createResource: {
        run: (id, projectId, type, title, content, vaultPath, folderId, metadata, createdAt, updatedAt) => {
          resources.set(id, {
            id,
            project_id: projectId,
            type,
            title,
            content,
            vault_path: vaultPath,
            folder_id: folderId,
            metadata,
            created_at: createdAt,
            updated_at: updatedAt,
          });
        },
      },
      updateResource: {
        run: (title, content, metadata, updatedAt, id) => {
          const row = resources.get(id);
          if (!row) return;
          row.title = title;
          row.content = content;
          row.metadata = metadata;
          row.updated_at = updatedAt;
        },
      },
      deleteResource: { run: (id) => resources.delete(id) },
      findUrlResourceByCanonicalUrl: {
        get: (content, metaUrl) =>
          [...resources.values()].find((r) => r.type === 'url' && (r.content === content || r.content === metaUrl)),
      },
    }),
    resources,
  };
}

const vault = {
  readNoteMarkdown: ({ id }) => {
    const row = currentDb.resources.get(id);
    return { success: true, markdown: row?.content || '' };
  },
  writeNoteMarkdown: ({ id, markdown }) => {
    const row = currentDb.resources.get(id);
    if (row) row.content = markdown;
    return { success: true, vaultPath: `${id}.md` };
  },
  writeUrlMirror: () => ({ success: true, vaultPath: 'link.url' }),
};

const people = {
  upserts: [],
  upsertIdentityPerson(payload) {
    this.upserts.push(payload);
    const existing = this.upserts.filter((u) => u.source === payload.source && u.externalId === payload.externalId);
    return {
      id: 'person-1',
      displayName: payload.displayName,
      profile: {},
      identities: existing,
    };
  },
  updateProfile(payload) {
    return { id: payload.id, displayName: payload.displayName, notes: payload.notes, profile: payload.profile };
  },
  addInteraction() {
    return {};
  },
};

const scheduler = {
  init() {},
  shouldIndex: () => true,
  scheduleSemanticReindex() {},
};

let currentDb;

function service() {
  currentDb = createFakeDb({
    resources: {
      n1: {
        id: 'n1',
        project_id: 'default',
        type: 'note',
        title: 'Web note',
        content: 'hello',
        updated_at: 10,
      },
    },
  });
  people.upserts = [];
  return createCaptureService({
    database: currentDb,
    fileStorage: {},
    windowManager: { broadcast() {} },
    vaultStore: vault,
    peopleStore: people,
    semanticIndexScheduler: scheduler,
  });
}

describe('browser extension capture service', () => {
  it('refuses to overwrite a note when expectedUpdatedAt does not match', () => {
    const capture = service();
    assert.throws(
      () => capture.updateNote('n1', { markdown: 'new', expectedUpdatedAt: 1 }),
      (err) => err.statusCode === 409 && err.payload.conflict === true,
    );
    const saved = capture.updateNote('n1', { markdown: 'new', expectedUpdatedAt: 10 });
    assert.equal(saved.markdown, 'new');
  });

  it('returns the persisted revision when the vault advances the timestamp on creation', () => {
    const db = createFakeDb();
    const capture = createCaptureService({
      database: db,
      fileStorage: {},
      vaultStore: {
        ...vault,
        writeNoteMarkdown: ({ id, markdown }) => {
          const row = db.resources.get(id);
          row.content = markdown;
          row.updated_at += 5;
          return { success: true, vaultPath: `${id}.md` };
        },
        readNoteMarkdown: ({ id }) => ({ success: true, markdown: db.resources.get(id).content }),
      },
      peopleStore: people,
      semanticIndexScheduler: scheduler,
    });
    const created = capture.createNote({ projectId: 'default', title: 'New note', markdown: 'Draft' });
    assert.equal(created.updatedAt, db.resources.get(created.id).updated_at);
    assert.doesNotThrow(() => capture.updateNote(created.id, { markdown: 'Edited', expectedUpdatedAt: created.updatedAt }));
  });

  it('ignores metadata-only timestamp changes but detects edits at the same timestamp', () => {
    const capture = service();
    const note = capture.getNote('n1');
    currentDb.resources.get('n1').updated_at = 50;
    assert.doesNotThrow(() => capture.updateNote('n1', {
      markdown: 'My draft', expectedUpdatedAt: note.updatedAt, expectedRevision: note.revision,
    }));
    const latest = capture.getNote('n1');
    currentDb.resources.get('n1').content = 'Edited in Desktop';
    assert.throws(() => capture.updateNote('n1', {
      markdown: 'Do not overwrite', expectedUpdatedAt: latest.updatedAt, expectedRevision: latest.revision,
    }), (err) => err.statusCode === 409);
  });

  it('appends a citation without dropping existing markdown', () => {
    const capture = service();
    const next = capture.appendSelection('n1', {
      text: 'Quoted',
      title: 'Page',
      url: 'https://example.com/p',
      expectedUpdatedAt: 10,
      capturedAt: Date.parse('2026-04-01T00:00:00Z'),
    });
    assert.match(next.markdown, /hello/);
    assert.match(next.markdown, /> Quoted/);
    assert.match(next.markdown, /example.com\/p/);
  });

  it('deduplicates contacts by identity and reuses an existing URL', () => {
    const capture = service();
    const first = capture.saveContact({
      projectId: 'default',
      displayName: 'Ada',
      source: 'social_linkedin',
      externalId: 'ada-lovelace',
      pageUrl: 'https://www.linkedin.com/in/ada-lovelace/',
    });
    const second = capture.saveContact({
      projectId: 'default',
      displayName: 'Ada Lovelace',
      source: 'social_linkedin',
      externalId: 'ada-lovelace',
      pageUrl: 'https://www.linkedin.com/in/ada-lovelace/',
    });
    assert.equal(first.person.id, 'person-1');
    assert.equal(second.created, false);
    assert.equal(people.upserts.length, 2);

    const page = capture.saveUrl({
      projectId: 'default',
      url: 'https://example.com/a?utm_source=x',
      title: 'Article',
      readableText: 'body',
    });
    const again = capture.saveUrl({
      projectId: 'default',
      url: 'https://example.com/a',
      title: 'Article',
    });
    assert.equal(page.reused, false);
    assert.equal(again.reused, true);
    assert.equal(again.id, page.id);
    assert.match(page.domeLink, /^dome:\/\/resource\/.+\/url$/);
  });
});
