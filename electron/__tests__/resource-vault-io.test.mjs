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
      file_path TEXT, internal_path TEXT, folder_id TEXT, metadata TEXT,
      vault_path TEXT, content_text TEXT, content_hash TEXT, file_mime_type TEXT,
      file_size INTEGER, file_hash TEXT, original_filename TEXT, thumbnail_data TEXT,
      created_at INTEGER, updated_at INTEGER
    );
    INSERT INTO resources (id, project_id, type, title) VALUES ('folder', 'default', 'folder', 'Research');
  `);
  queries = {
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    getProjectById: db.prepare('SELECT * FROM projects WHERE id = ?'),
    createResource: db.prepare('INSERT INTO resources (id,project_id,type,title,content,file_path,folder_id,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'),
    createResourceWithFile: db.prepare('INSERT INTO resources (id,project_id,type,title,content,file_path,internal_path,file_mime_type,file_size,file_hash,thumbnail_data,original_filename,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
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
  it('imports Markdown into its folder and keeps an up-to-date DB fallback', async () => {
    const resource = await importContent('note.md', '\uFEFF---\r\ntitle: Old\r\n---\r\n# Hello', { folder_id: 'folder' });
    assert.equal(resource.type, 'note');
    assert.equal(resource.folder_id, 'folder');
    assert.equal(resource.vault_path, 'Research/Example.md');
    assert.equal(resource.internal_path, null);
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
    assert.equal(resource.internal_path, null);
    assert.equal(resource.vault_path, 'Research/report.docx');
    const fullPath = resourcePath(resource);
    assert.ok(extractedPaths.includes(fullPath), 'worker failure uses the injected extractor');
    const read = handlers.get('resource:readDocumentContent')(event, resource.id);
    assert.equal(Buffer.from(read.data, 'base64').toString(), 'original bytes');
    const save = await handlers.get('resource:saveDocxFromHtml')(event, { resourceId: resource.id, html: '<p>Edited</p>' });
    assert.equal(save.success, true, save.error);
    assert.deepEqual(fs.readFileSync(fullPath), docxBytes);
    assert.equal(save.data.internal_path, null, 'saving must not create a second legacy copy');
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

  it('still reads and saves legacy internal files', async () => {
    const legacy = await fileStorage.importFromBuffer(Buffer.from('legacy'), 'old.docx', 'document');
    db.prepare('INSERT INTO resources (id,project_id,type,title,internal_path) VALUES (?,?,?,?,?)').run('legacy', 'default', 'document', 'old.docx', legacy.internalPath);
    assert.equal(handlers.get('resource:readDocumentContent')(event, 'legacy').success, true);
    const result = await handlers.get('resource:saveDocxFromHtml')(event, { resourceId: 'legacy', html: '<p>New</p>' });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(fs.readFileSync(fileStorage.getFullPath(legacy.internalPath)), docxBytes);
  });
});
