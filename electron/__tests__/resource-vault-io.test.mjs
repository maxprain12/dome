import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const vault = require('../storage/vault-store.cjs');

// Replace service boundaries; exercise the real IPC handlers, vault and SQLite.
function loadModule(relativePath, replacements = {}) {
  const filename = require.resolve(relativePath);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(
    (name) => replacements[name] ?? localRequire(name), module, module.exports,
  );
  return module.exports;
}

let tmp, db, queries, fileStorage, handlers, broadcasts, database;
let extractedPaths, thumbnailPaths;
const event = { sender: { id: 1 } };
const docxBytes = Buffer.from('DOCX bytes');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-vault-io-'));
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, vault_root TEXT);
    INSERT INTO projects VALUES ('default', 'Library', NULL);
    CREATE TABLE resources (
      id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT,
      folder_id TEXT, metadata TEXT,
      vault_path TEXT, content_text TEXT, content_hash TEXT, file_mime_type TEXT,
      file_size INTEGER, file_hash TEXT, original_filename TEXT, thumbnail_data TEXT,
      created_at INTEGER, updated_at INTEGER
    );
    INSERT INTO resources (id, project_id, type, title) VALUES ('folder', 'default', 'folder', 'Research');
  `);
  queries = {
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    getProjectById: db.prepare('SELECT * FROM projects WHERE id = ?'),
    getResourcesByFolder: db.prepare('SELECT * FROM resources WHERE folder_id = ?'),
    createResource: db.prepare('INSERT INTO resources (id,project_id,type,title,content,vault_path,folder_id,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'),
    createResourceWithFile: db.prepare('INSERT INTO resources (id,project_id,type,title,content,vault_path,file_mime_type,file_size,file_hash,thumbnail_data,original_filename,metadata,created_at,updated_at,folder_id,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    updateResource: db.prepare('UPDATE resources SET title=?,content=?,metadata=?,updated_at=? WHERE id=?'),
    updateResourceThumbnail: db.prepare('UPDATE resources SET thumbnail_data=?,updated_at=? WHERE id=?'),
    moveResourceToFolder: db.prepare('UPDATE resources SET folder_id=?,updated_at=? WHERE id=?'),
    deleteResource: db.prepare('DELETE FROM resources WHERE id=?'),
  };
  database = { getDB: () => db, getQueries: () => queries };
  fileStorage = loadModule('../storage/file-storage.cjs', { electron: { app: { getPath: () => tmp } } });
  handlers = new Map(); broadcasts = []; extractedPaths = []; thumbnailPaths = [];
  loadModule('../ipc/data/resources.cjs', {
    '../../storage/semantic-index-scheduler.cjs': { init() {}, shouldIndex: () => false },
    '../../ai/auto-metadata.cjs': { scheduleCloudAutoMetadata() {} },
    '../../workers/document-extract-service.cjs': { extractInWorker: async () => { throw new Error('worker unavailable'); } },
  }).register({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, fs, path, database, fileStorage,
    windowManager: { isAuthorized: () => true, broadcast: (...args) => broadcasts.push(args) },
    thumbnail: { generateThumbnail: async (p) => {
      thumbnailPaths.push(p);
      const rows = db.prepare('SELECT * FROM resources WHERE vault_path IS NOT NULL').all();
      assert.ok(rows.some((row) => resourcePath(row) === p), 'register the file before asynchronous enrichment');
      return 'preview';
    } },
    documentExtractor: {
      extractDocumentText: async (p) => { extractedPaths.push(p); return 'extracted'; },
      extractDocxText: async (p) => { extractedPaths.push(p); return 'edited'; },
    },
    documentGenerator: { extractPptImages: async (p) => ({ success: true, path: p }) },
    docxConverter: { htmlToDocxBuffer: async () => docxBytes },
    sanitizePath: (p) => p,
  });
});
afterEach(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function importContent(filename, content, extra = {}) {
  const result = await handlers.get('resource:importFromContent')(event, {
    title: 'Example', filename, content, project_id: 'default', ...extra,
  });
  assert.equal(result.success, true, result.error);
  return result.resource;
}
function resourcePath(resource) { return vault.getResourceFilePath(resource, queries, fileStorage); }

describe('vault document lifecycle', () => {
  it('imports Markdown into its folder and keeps an up-to-date search cache', async () => {
    const resource = await importContent('note.md', '\uFEFF---\r\ntitle: Old\r\n---\r\n# Hello', { folder_id: 'folder' });
    assert.equal(resource.type, 'note');
    assert.equal(resource.folder_id, 'folder');
    assert.equal(resource.vault_path, 'Research/Example.md');
    assert.equal('internal_path' in resource, false);
    assert.equal(resource.content, '# Hello');
    const written = vault.writeNoteMarkdown({ id: resource.id, markdown: '**Edited**' }, { database, fileStorage });
    assert.equal(written.success, true);
    assert.equal(queries.getResourceById.get(resource.id).content, '**Edited**');
    assert.equal(queries.getResourceById.get(resource.id).content_text, 'Edited');
  });

  it('publishes note content after a successful mirror write and uses the current title', async () => {
    const resource = await importContent('note.md', 'Original');
    db.prepare('UPDATE resources SET title=? WHERE id=?').run('Renamed', resource.id);
    const indexed = [];
    loadModule('../ipc/data/notes.cjs', {
      '../../storage/semantic-index-scheduler.cjs': { init() {}, scheduleSemanticReindex: (id) => indexed.push(id) },
    }).register({
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, database, fileStorage,
      windowManager: { isAuthorized: () => true, broadcast: (...args) => broadcasts.push(args) },
    });
    const result = handlers.get('notes:writeMirror')(event, { id: resource.id, markdown: 'Latest body' });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(indexed, [resource.id]);
    assert.equal(broadcasts.at(-1)[1].updates.content, 'Latest body');
    const updated = queries.getResourceById.get(resource.id);
    assert.equal(updated.vault_path, 'Renamed.md');
    assert.match(fs.readFileSync(resourcePath(updated), 'utf8'), /title: "Renamed"/);
    assert.equal(fs.existsSync(resourcePath(resource)), false, 'the old path is removed');
  });

  it('keeps a frontmatter-only note empty', async () => {
    const resource = await importContent('empty.md', '---\r\ntitle: Old\r\n---\r\n');
    assert.equal(resource.content, '');
  });

  it('imports DOCX as a document, reads and saves the same vault file, then exports it', async () => {
    const resource = await importContent('report.docx', 'original bytes', { type: 'document', folder_id: 'folder' });
    assert.equal(resource.type, 'document');
    assert.equal('internal_path' in resource, false);
    assert.equal(resource.vault_path, 'Research/report.docx');
    const fullPath = resourcePath(resource);
    assert.ok(extractedPaths.includes(fullPath), 'worker failure uses the injected extractor');
    const read = handlers.get('resource:readDocumentContent')(event, resource.id);
    assert.equal(Buffer.from(read.data, 'base64').toString(), 'original bytes');
    const save = await handlers.get('resource:saveDocxFromHtml')(event, { resourceId: resource.id, html: '<p>Edited</p>' });
    assert.equal(save.success, true, save.error);
    assert.deepEqual(fs.readFileSync(fullPath), docxBytes);
    assert.equal('internal_path' in save.data, false);
    assert.equal(save.data.content_hash, vault.contentHash(docxBytes));
    const destinationPath = path.join(tmp, 'export.docx');
    assert.equal((await handlers.get('resource:export')(event, { resourceId: resource.id, destinationPath })).success, true);
    assert.deepEqual(fs.readFileSync(destinationPath), docxBytes);
  });

  it('saves spreadsheets and generates previews using vault paths', async () => {
    const resource = await importContent('sheet.xlsx', 'old sheet');
    const result = await handlers.get('resource:writeExcelContent')(event, { resourceId: resource.id, data: Buffer.from('new sheet').toString('base64') });
    assert.equal(result.success, true, result.error);
    assert.equal(fs.readFileSync(resourcePath(resource), 'utf8'), 'new sheet');
    assert.equal(queries.getResourceById.get(resource.id).file_size, 9);
    assert.equal((await handlers.get('resource:regenerateThumbnail')(event, resource.id)).success, true);
    assert.equal(thumbnailPaths.at(-1), resourcePath(resource));
    const ppt = await importContent('slides.pptx', 'slides');
    const slides = await handlers.get('resource:extractPptImages')(event, ppt.id);
    assert.equal(slides.path, resourcePath(ppt));
  });

  it('migrates legacy files once, drops their columns and leaves original bytes intact', async () => {
    db.exec('ALTER TABLE resources ADD COLUMN internal_path TEXT; ALTER TABLE resources ADD COLUMN file_path TEXT');
    const oldPath = path.join(fileStorage.getStorageDir(), 'documents', 'old-hash.docx');
    fs.mkdirSync(path.dirname(oldPath), { recursive: true });
    fs.writeFileSync(oldPath, 'legacy');
    db.prepare('INSERT INTO resources (id,project_id,type,title,internal_path,original_filename) VALUES (?,?,?,?,?,?)')
      .run('legacy', 'default', 'document', 'Original', 'documents/old-hash.docx', 'Original.docx');
    assert.equal(handlers.get('resource:readDocumentContent')(event, 'legacy').success, false);
    const migration = require('../storage/vault-migration.cjs');
    const first = migration.migrateLegacyVault({ database, fileStorage });
    assert.equal(first.failed, 0, JSON.stringify(first.errors));
    const resource = queries.getResourceById.get('legacy');
    assert.equal(resource.vault_path, 'Original.docx');
    assert.equal('internal_path' in resource, false);
    assert.equal(fs.readFileSync(resourcePath(resource), 'utf8'), 'legacy');
    assert.equal(fs.readFileSync(oldPath, 'utf8'), 'legacy');
    assert.ok(fs.existsSync(path.join(fileStorage.getStorageDir(), 'migration-backups', 'before-vault-unification.sqlite')));
    assert.equal(migration.migrateLegacyVault({ database, fileStorage }).migrated, 0);
    const result = await handlers.get('resource:saveDocxFromHtml')(event, { resourceId: 'legacy', html: '<p>New</p>' });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(fs.readFileSync(resourcePath(resource)), docxBytes);
    assert.equal(fs.readFileSync(oldPath, 'utf8'), 'legacy');
  });

  it('keeps a missing legacy source pending without enabling runtime fallback', () => {
    db.exec('ALTER TABLE resources ADD COLUMN file_path TEXT');
    db.prepare('INSERT INTO resources (id,project_id,type,title,file_path) VALUES (?,?,?,?,?)')
      .run('missing', 'default', 'document', 'Missing', path.join(tmp, 'missing.docx'));
    const migration = require('../storage/vault-migration.cjs');
    const result = migration.migrateLegacyVault({ database, fileStorage });
    assert.equal(result.failed, 1);
    assert.equal(result.errors[0].id, 'missing');
    assert.equal(queries.getResourceById.get('missing').file_path, path.join(tmp, 'missing.docx'));
    assert.equal(resourcePath(queries.getResourceById.get('missing')), null);
  });

  it('does not overwrite files that the watcher has not indexed yet', async () => {
    const root = vault.getProjectVaultRoot('default', queries, fileStorage);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'report.docx'), 'unindexed');
    fs.writeFileSync(path.join(root, 'report (2).docx'), 'also unindexed');
    const resource = await importContent('report.docx', 'imported');
    assert.equal(resource.vault_path, 'report (3).docx');
    assert.equal(fs.readFileSync(path.join(root, 'report.docx'), 'utf8'), 'unindexed');
    assert.equal(fs.readFileSync(resourcePath(resource), 'utf8'), 'imported');
  });

  it('converts legacy rich text notes to Markdown during migration', () => {
    db.prepare('INSERT INTO resources (id,project_id,type,title,content) VALUES (?,?,?,?,?)')
      .run('old-note', 'default', 'note', 'Old note', JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] }] }));
    const result = require('../storage/vault-migration.cjs').migrateLegacyVault({ database, fileStorage });
    assert.equal(result.failed, 0, JSON.stringify(result.errors));
    const note = queries.getResourceById.get('old-note');
    assert.match(fs.readFileSync(resourcePath(note), 'utf8'), /# Hello/);
    assert.equal(note.content.trim(), '# Hello');
  });

  it('moves notebook working files into its vault folder exactly once', () => {
    const source = path.join(tmp, 'work');
    fs.mkdirSync(path.join(source, 'data'), { recursive: true });
    fs.writeFileSync(path.join(source, 'data', 'sample.csv'), 'a,b');
    db.prepare('INSERT INTO resources (id,project_id,type,title,content,metadata) VALUES (?,?,?,?,?,?)')
      .run('nb', 'default', 'notebook', 'Analysis', JSON.stringify({ cells: [] }), JSON.stringify({ notebook_workspace_path: source, custom: 'keep' }));
    const migration = require('../storage/vault-migration.cjs');
    const result = migration.migrateLegacyVault({ database, fileStorage });
    assert.equal(result.failed, 0, JSON.stringify(result.errors));
    const notebook = queries.getResourceById.get('nb');
    assert.equal(notebook.folder_id, 'notebook-files-nb');
    assert.deepEqual(JSON.parse(notebook.metadata), { custom: 'keep' });
    assert.equal(fs.readFileSync(path.join(path.dirname(resourcePath(notebook)), 'data', 'sample.csv'), 'utf8'), 'a,b');
    assert.equal(migration.migrateLegacyVault({ database, fileStorage }).migrated, 0);
    assert.ok(fs.existsSync(path.join(source, 'data', 'sample.csv')));
  });
  it('uses the notebook resource location as cwd and ignores caller-supplied folders', async () => {
    const notebook = await importContent('analysis.dnb', JSON.stringify({ cells: [{ cell_type: 'code', source: 'print(1)' }] }));
    assert.equal(JSON.parse(notebook.content).cells[0].source, 'print(1)');
    let execution;
    loadModule('../ipc/media/notebook.cjs').register({
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, database, fileStorage,
      windowManager: { isAuthorized: () => true },
      notebookPython: { runPythonCode: async (code, options) => { execution = { code, options }; return { success: true }; } },
    });
    const workspace = handlers.get('notebook:workspace')(event, { resourceId: notebook.id });
    assert.equal(workspace.data.path, path.dirname(resourcePath(notebook)));
    const run = handlers.get('notebook:runPython');
    assert.equal((await run(event, { surface: 'notebook', code: 'print(1)', cwd: tmp })).success, false);
    assert.equal(execution, undefined);
    assert.equal((await run(event, { surface: 'notebook', code: 'print(1)', resourceId: notebook.id, cwd: tmp })).success, true);
    assert.equal(execution.options.cwd, workspace.data.path);
    assert.equal(handlers.get('notebook:workspace')(event, { resourceId: 'folder' }).success, false);
  });

  it('fails duplication when the canonical note file is unavailable', async () => {
    const note = await importContent('note.md', 'Cached text');
    fs.unlinkSync(resourcePath(note));
    const before = db.prepare('SELECT count(*) AS n FROM resources').get().n;
    const result = require('../storage/resource-duplicate.cjs').duplicateResourceTree(note.id, {
      database, fileStorage, windowManager: { broadcast() {} },
    });
    assert.equal(result.success, false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM resources').get().n, before);
  });

  it('syncs a new blob after editing the same vault file', async () => {
    db.exec(`CREATE TABLE vault_blobs (id TEXT PRIMARY KEY, hash TEXT UNIQUE, size_bytes INTEGER,
      mime TEXT, original_name TEXT, upload_state TEXT, local_state TEXT, created_at INTEGER, updated_at INTEGER)`);
    const sync = loadModule('../storage/blob-sync.cjs', {
      './file-storage.cjs': fileStorage,
      '../auth/dome-oauth.cjs': {},
      '../ai/dome-provider-url.cjs': { getDomeProviderBaseUrl: () => '' },
    });
    const note = await importContent('sync.md', 'First version');
    assert.equal(await sync.ingestLocalFiles(db, queries), 1);
    const firstHash = queries.getResourceById.get(note.id).file_hash;
    assert.equal(await sync.ingestLocalFiles(db, queries), 0);
    vault.writeNoteMarkdown({ id: note.id, markdown: 'Second version' }, { database, fileStorage });
    assert.equal(await sync.ingestLocalFiles(db, queries), 1);
    const current = queries.getResourceById.get(note.id);
    assert.notEqual(current.file_hash, firstHash);
    assert.equal(current.file_hash, vault.contentHash(fs.readFileSync(resourcePath(current))));
    assert.equal(await sync.ingestLocalFiles(db, queries), 0);
  });

  it('prepares every query against a fresh canonical schema and after legacy columns are dropped', () => {
    const fresh = new DatabaseSync(':memory:');
    fresh.pragma = (sql, opts) => {
      const rows = fresh.prepare(`PRAGMA ${sql}`).all();
      return opts?.simple ? Object.values(rows[0] || {})[0] : rows;
    };
    try {
      const { createBaseSchema } = require('../core/db/schema.cjs');
      const { buildQueries } = require('../core/db/queries.cjs');
      createBaseSchema(fresh);
      assert.ok(Object.keys(buildQueries(fresh)).length > 300);
      fresh.exec('ALTER TABLE resources ADD COLUMN internal_path TEXT; ALTER TABLE resources ADD COLUMN file_path TEXT');
      const fullDatabase = { getDB: () => fresh, getQueries: () => buildQueries(fresh) };
      require('../storage/vault-migration.cjs').migrateLegacyVault({ database: fullDatabase, fileStorage });
      createBaseSchema(fresh);
      assert.ok(Object.keys(buildQueries(fresh)).length > 300);
      const columns = fresh.prepare('PRAGMA table_info(resources)').all().map((column) => column.name);
      assert.ok(!columns.includes('file_path') && !columns.includes('internal_path'));
    } finally { fresh.close(); }
  });

  it('uses the MIME extension for cloud filenames without an extension', async () => {
    const resource = await importContent('Cloud report', 'docx bytes', {
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    assert.equal(resource.type, 'document');
    assert.equal(resource.vault_path, 'Cloud report.docx');
  });

  it('removes the copied file if resource registration fails', async () => {
    const root = vault.getProjectVaultRoot('default', queries, fileStorage);
    queries.createResourceWithFile = { run() { throw new Error('Database write failed'); } };
    const result = await handlers.get('resource:importFromContent')(event, {
      title: 'Broken', filename: 'broken.docx', content: 'bytes', project_id: 'default',
    });
    assert.equal(result.success, false);
    assert.equal(fs.existsSync(path.join(root, 'broken.docx')), false);
  });

});
