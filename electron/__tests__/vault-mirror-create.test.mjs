/**
 * Integration test for the vault-mirror path that agent `resource_create` now uses.
 *
 * Bug pinned: the agent's `resourceCreate` (electron/tools/ai-tools-handler.cjs)
 * used to insert a DB row + broadcast `resource:created` but NEVER wrote a physical
 * file to the vault (vault_path stayed NULL), so the workspace — which reflects the
 * on-disk vault — never showed agent-created folders/notes. resourceCreate now
 * mirrors to disk via vault-store.createFolderOnDisk / writeNoteMarkdown, exactly
 * like the IPC create path (electron/ipc/data/database.cjs).
 *
 * This test exercises those vault-store primitives end-to-end against a real temp
 * vault dir + a real sqlite DB, asserting the physical file/dir appears and
 * vault_path is persisted.
 *
 * Run: node --test electron/__tests__/vault-mirror-create.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const vaultStore = require('../storage/vault-store.cjs');
const vaultSync = require('../storage/vault-sync.cjs');

let tmpDir;
let db;
let database;
let fileStorage;

function setupSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, vault_root TEXT);
    CREATE TABLE resources (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT,
      title TEXT,
      content TEXT,
      file_path TEXT,
      folder_id TEXT,
      metadata TEXT,
      vault_path TEXT,
      content_text TEXT,
      content_hash TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-vault-test-'));
  db = new DatabaseSync(':memory:');
  setupSchema(db);

  const getResourceById = db.prepare('SELECT * FROM resources WHERE id = ?');
  const getProjectById = db.prepare('SELECT * FROM projects WHERE id = ?');
  database = { getDB: () => db, getQueries: () => ({ getResourceById, getProjectById }) };
  // fileStorage only needs getStorageDir(); the vault lives under <storageDir>/vault.
  fileStorage = { getStorageDir: () => tmpDir };

  const now = Date.now();
  db.prepare('INSERT INTO projects (id, name, vault_root) VALUES (?, ?, ?)').run('proj1', 'IA Research', null);
  // Folder created by the agent
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, folder_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run('fold1', 'proj1', 'folder', 'IA Research', null, now, now);
  // Note created by the agent inside that folder
  db.prepare(
    'INSERT INTO resources (id, project_id, type, title, content, folder_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
  ).run('note1', 'proj1', 'note', 'MiniMax Sparse Attention', 'Findings about sparse attention', 'fold1', now, now);
});

after(() => {
  try { db?.close(); } catch { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('vault mirror — agent resource_create path', () => {
  it('createFolderOnDisk creates the physical directory and persists vault_path', () => {
    const res = vaultStore.createFolderOnDisk('fold1', { database, fileStorage });
    assert.equal(res.success, true);
    assert.ok(res.vaultPath, 'vault_path should be returned');

    const root = path.join(tmpDir, 'vault', 'IA Research');
    const abs = path.join(root, res.vaultPath);
    assert.ok(fs.existsSync(abs), `folder dir should exist on disk at ${abs}`);
    assert.ok(fs.statSync(abs).isDirectory());

    const row = database.getQueries().getResourceById.get('fold1');
    assert.equal(row.vault_path, res.vaultPath, 'vault_path persisted on the folder row');
  });

  it('writeNoteMarkdown writes a physical .md inside the folder and round-trips', () => {
    const res = vaultStore.writeNoteMarkdown(
      { id: 'note1', markdown: '# Sparse Attention\n\nKey findings.' },
      { database, fileStorage },
    );
    assert.equal(res.success, true);
    assert.match(res.vaultPath, /\.md$/, 'note mirror should be a .md file');

    const root = path.join(tmpDir, 'vault', 'IA Research');
    const abs = path.join(root, res.vaultPath);
    assert.ok(fs.existsSync(abs), `note .md should exist on disk at ${abs}`);
    const contents = fs.readFileSync(abs, 'utf8');
    assert.ok(contents.includes('Key findings.'), 'markdown body written to disk');

    const back = vaultStore.readNoteMarkdown({ id: 'note1' }, { database, fileStorage });
    assert.equal(back.success, true);
    assert.ok(String(back.markdown).includes('Key findings.'), 'round-trips from disk');
  });

  it('the note .md lives under the agent-created folder directory', () => {
    const folder = database.getQueries().getResourceById.get('fold1');
    const note = database.getQueries().getResourceById.get('note1');
    assert.ok(
      note.vault_path.startsWith(`${folder.vault_path}/`),
      `note vault_path (${note.vault_path}) should be nested under folder (${folder.vault_path})`,
    );
  });
});

describe('vault sync — agent move/delete path', () => {
  it('syncVaultAfterMoveToFolder backfills logical folder and relocates note on disk', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO resources (id, project_id, type, title, content_text, folder_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    ).run('note-root', 'proj1', 'note', 'Root Note', 'Root body', null, now, now);
    db.prepare(
      'INSERT INTO resources (id, project_id, type, title, folder_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    ).run('fold-logical', 'proj1', 'folder', 'Research IA', null, now, now);

    vaultStore.writeNoteMarkdown(
      { id: 'note-root', markdown: 'Root body' },
      { database, fileStorage },
    );

    const moveStmt = db.prepare('UPDATE resources SET folder_id = ?, updated_at = ? WHERE id = ?');
    moveStmt.run('fold-logical', now + 1, 'note-root');

    vaultSync.syncVaultAfterMoveToFolder('note-root', { database, fileStorage });

    const folder = database.getQueries().getResourceById.get('fold-logical');
    assert.ok(folder.vault_path, 'logical folder should get vault_path after move sync');

    const note = database.getQueries().getResourceById.get('note-root');
    assert.ok(note.vault_path.startsWith(`${folder.vault_path}/`), 'note should be nested under folder on disk');

    const root = path.join(tmpDir, 'vault', 'IA Research');
    const abs = path.join(root, note.vault_path);
    assert.ok(fs.existsSync(abs), `moved note .md should exist at ${abs}`);
  });

  it('syncVaultBeforeDelete removes the mirror file from disk', () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO resources (id, project_id, type, title, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    ).run('note-del', 'proj1', 'note', 'To Delete', now, now);

    const write = vaultStore.writeNoteMarkdown(
      { id: 'note-del', markdown: 'Delete me' },
      { database, fileStorage },
    );
    assert.equal(write.success, true);

    const root = path.join(tmpDir, 'vault', 'IA Research');
    const absBefore = path.join(root, write.vaultPath);
    assert.ok(fs.existsSync(absBefore));

    vaultSync.syncVaultBeforeDelete('note-del', { database, fileStorage });
    db.prepare('DELETE FROM resources WHERE id = ?').run('note-del');

    assert.ok(!fs.existsSync(absBefore), 'mirror file should be removed from disk');
  });
});
