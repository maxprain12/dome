import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { createPluginService } = require('../plugins/plugin-service.cjs');
const vaultStore = require('../storage/vault-store.cjs');

test('a failed mirror write rolls back the note revision so the same draft can be retried', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE resources (id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT, metadata TEXT, updated_at INTEGER)');
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run('note', 'vault', 'note', 'Original', 'Original body', JSON.stringify({ plugins: { cms: { fields: {} } } }), 1);
  const queries = {
    getPluginGrant: { get: () => ({ plugin_id: 'cms', manifest_digest: 'digest', project_id: 'vault', permissions_json: '["notes.write"]', config_json: '{}' }) },
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    updatePluginNoteIfCurrent: db.prepare('UPDATE resources SET title = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ? AND project_id = ? AND updated_at = ?'),
  };
  const broadcasts = [];
  const service = createPluginService({
    database: {
      getQueries: () => queries,
      getDB: () => ({ transaction: (fn) => () => {
        db.exec('BEGIN');
        try { const result = fn(); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      } }),
    },
    fileStorage: {},
    windowManager: { broadcast: (...args) => broadcasts.push(args) },
    pluginLoader: { listPlugins: () => [{ id: 'cms', enabled: true, manifestDigest: 'digest', contributes: { vaultTemplate: { fields: [] } } }] },
  });
  const originalWrite = vaultStore.writeNoteMarkdown;
  t.after(() => { vaultStore.writeNoteMarkdown = originalWrite; });
  vaultStore.writeNoteMarkdown = () => ({ success: false, error: 'Disk full' });
  const params = { id: 'note', expectedUpdatedAt: 1, title: 'Edited', body: 'Keep my draft' };
  await assert.rejects(service.request('cms', 'notes.update', params), /Disk full/);
  assert.equal(queries.getResourceById.get('note').updated_at, 1);
  assert.equal(queries.getResourceById.get('note').content, 'Original body');
  assert.equal(broadcasts.length, 0);
  vaultStore.writeNoteMarkdown = () => ({ success: true });
  const saved = await service.request('cms', 'notes.update', params);
  assert.equal(saved.body, 'Keep my draft');
  assert.ok(saved.updatedAt > 1);
  assert.equal(broadcasts.length, 1);
  await assert.rejects(service.request('cms', 'notes.update', params), /CONFLICT/);
});

test('content revisions tolerate metadata updates but reject actual concurrent edits', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE resources (id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT, metadata TEXT, updated_at INTEGER)');
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run('note', 'vault', 'note', 'Original', 'Body', JSON.stringify({ plugins: { cms: { fields: {} } } }), 1);
  const queries = {
    getPluginGrant: { get: () => ({ plugin_id: 'cms', manifest_digest: 'digest', project_id: 'vault', permissions_json: '["notes.read","notes.write"]', config_json: '{}' }) },
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    updatePluginNoteIfCurrent: db.prepare('UPDATE resources SET title = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ? AND project_id = ? AND updated_at = ?'),
  };
  const service = createPluginService({
    database: { getQueries: () => queries, getDB: () => ({ transaction: (fn) => fn }) },
    fileStorage: {}, windowManager: { broadcast() {} },
    pluginLoader: { listPlugins: () => [{ id: 'cms', enabled: true, manifestDigest: 'digest', contributes: { vaultTemplate: { fields: [] } } }] },
  });
  const originalWrite = vaultStore.writeNoteMarkdown;
  t.after(() => { vaultStore.writeNoteMarkdown = originalWrite; });
  vaultStore.writeNoteMarkdown = () => ({ success: true });
  const original = await service.request('cms', 'notes.get', { id: 'note' });
  db.prepare('UPDATE resources SET updated_at = 2 WHERE id = ?').run('note');
  const params = { id: 'note', expectedUpdatedAt: original.updatedAt, expectedContentDigest: original.contentDigest, body: 'My edit' };
  const saved = await service.request('cms', 'notes.update', params);
  assert.equal(saved.body, 'My edit');
  assert.notEqual(saved.contentDigest, original.contentDigest);
  await assert.rejects(service.request('cms', 'notes.update', { ...params, body: 'Stale edit' }), /CONFLICT/);
  assert.equal(queries.getResourceById.get('note').content, 'My edit');
});
