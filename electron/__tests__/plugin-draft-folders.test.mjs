import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createPluginService } = require('../plugins/plugin-service.cjs');

test('drafts, translations and existing root drafts follow their configured content folders', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-cms-folders-'));
  const db = new DatabaseSync(':memory:');
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  db.exec(`CREATE TABLE resources (id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT,
    file_path TEXT, folder_id TEXT, vault_path TEXT, metadata TEXT, created_at INTEGER, updated_at INTEGER,
    content_text TEXT, content_hash TEXT)`);
  const queries = {
    getPluginGrant: { get: () => ({ plugin_id: 'cms', manifest_digest: 'digest', project_id: 'vault', permissions_json: '["notes.read","notes.write"]', config_json: JSON.stringify({ github: { contentPaths: { 'blog/es': 'src/content/blog/es', 'blog/en': 'src/content/blog/en' } } }) }) },
    getProjectById: { get: () => ({ name: 'Landing', vault_path: root }) },
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    listPluginNotes: db.prepare("SELECT * FROM resources WHERE project_id = ? AND type = 'note'"),
    createResource: db.prepare('INSERT INTO resources (id,project_id,type,title,content,file_path,folder_id,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'),
    deleteResource: db.prepare('DELETE FROM resources WHERE id = ?'),
    updatePluginNoteIfCurrent: db.prepare('UPDATE resources SET title = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ? AND project_id = ? AND updated_at = ?'),
  };
  db.transaction = (fn) => () => {
    db.exec('BEGIN');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const service = createPluginService({
    database: { getQueries: () => queries, getDB: () => db },
    fileStorage: { getStorageDir: () => root }, windowManager: { broadcast() {} },
    pluginLoader: { listPlugins: () => [{ id: 'cms', enabled: true, manifestDigest: 'digest', contributes: { vaultTemplate: { id: 'post', schemaVersion: 1, fields: [
      { id: 'slug', type: 'slug', label: 'Slug' }, { id: 'collection', type: 'select', label: 'Collection', options: ['blog'] },
      { id: 'language', type: 'select', label: 'Language', options: ['es', 'en'] }, { id: 'description', type: 'text', label: 'Description' },
    ] } } }] },
  });
  const note = await service.request('cms', 'notes.create', { title: 'Novedades', body: 'Mi borrador', fields: { collection: 'blog', language: 'es' } });
  const assertFolder = (id, language) => {
    const row = queries.getResourceById.get(id);
    assert.equal(queries.getResourceById.get(row.folder_id).vault_path, `src/content/blog/${language}`);
    assert.ok(row.vault_path.startsWith(`src/content/blog/${language}/`));
    return row;
  };
  assertFolder(note.id, 'es');
  const translated = await service.request('cms', 'notes.applyTranslations', {
    sourceId: note.id, expectedUpdatedAt: note.updatedAt, expectedContentDigest: note.contentDigest,
    familyId: 'family', title: note.title, body: note.body, fields: note.fields,
    translations: [{ language: 'en', title: 'News', body: 'My draft', description: 'News', slug: 'news' }],
  });
  const english = translated.notes.find((item) => item.fields.language === 'en');
  assertFolder(english.id, 'en');
  // Simulate a draft created before folder placement was supported.
  db.prepare('UPDATE resources SET folder_id = NULL WHERE id = ?').run(english.id);
  await service.request('cms', 'notes.list', {});
  assertFolder(english.id, 'en');
  const changed = await service.request('cms', 'notes.update', {
    id: english.id, expectedUpdatedAt: english.updatedAt, expectedContentDigest: english.contentDigest,
    fields: { language: 'es', slug: 'news-es' },
  });
  assertFolder(changed.id, 'es');
  assert.equal(changed.status, 'draft');
});
