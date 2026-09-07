/** One-way conversion of pre-vault libraries. Never used as a runtime fallback. */
const fs = require('node:fs');
const path = require('node:path');
const vault = require('./vault-store.cjs');

function legacyNoteMarkdown(resource) {
  const raw = String(resource.content || resource.content_text || '');
  const converted = require('../services/note-markdown.cjs').tiptapJsonToMarkdown(raw);
  if (converted !== null) return converted;
  if (raw.trim().startsWith('<')) {
    const Turndown = require('turndown');
    return new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(raw);
  }
  return raw;
}

function migrateNotebookDirectory(resource, deps) {
  const { database, fileStorage } = deps;
  const queries = database.getQueries();
  const metadata = typeof resource.metadata === 'string' ? JSON.parse(resource.metadata || '{}') : { ...resource.metadata };
  const source = metadata.notebook_workspace_path;
  if (!source) return;
  const root = vault.getProjectVaultRoot(resource.project_id, queries, fileStorage);
  if (!fs.existsSync(source)) throw new Error(`Notebook working folder missing: ${source}`);
  const currentFile = vault.getResourceFilePath(resource, queries, fileStorage);
  if (path.resolve(source) !== path.dirname(currentFile)) {
    if (path.resolve(root) === path.resolve(source) || path.resolve(root).startsWith(path.resolve(source) + path.sep)) {
      throw new Error('Notebook working folder contains the vault; relocate its files before migration');
    }
    const folderId = `notebook-files-${resource.id}`;
    if (!queries.getResourceById.get(folderId)) {
      const now = Date.now();
      queries.createResource.run(folderId, resource.project_id, 'folder', `${resource.title} files`, null, null, resource.folder_id, null, now, now);
    }
    const folderResult = vault.createFolderOnDisk(folderId, deps);
    if (!folderResult.success) throw new Error(folderResult.error);
    const target = path.join(root, folderResult.vaultPath);
    // A deterministic folder lets interrupted migrations resume without making copies.
    copyVerifiedTree(source, target);
    queries.moveResourceToFolder.run(folderId, Date.now(), resource.id);
    const moved = vault.relocateResource(resource.id, deps);
    if (!moved.vaultPath || path.dirname(path.join(root, moved.vaultPath)) !== target) {
      queries.moveResourceToFolder.run(resource.folder_id ?? null, Date.now(), resource.id);
      throw new Error('Could not move notebook into its vault folder');
    }
  }
  delete metadata.notebook_workspace_path;
  database.getDB().prepare('UPDATE resources SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), resource.id);
  const rewritten = vault.writeNotebookMirror({ id: resource.id }, deps);
  if (!rewritten.success) throw new Error(rewritten.error);
}

function copyVerifiedTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.venv' || entry.name === '__pycache__') continue;
    const src = path.join(source, entry.name);
    const dest = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Resolve symbolic link before migration: ${src}`);
    if (entry.isDirectory()) { copyVerifiedTree(src, dest); continue; }
    if (!entry.isFile()) continue;
    const bytes = fs.readFileSync(src);
    if (fs.existsSync(dest)) {
      if (vault.contentHash(fs.readFileSync(dest)) !== vault.contentHash(bytes)) {
        throw new Error(`Notebook migration would overwrite a different file: ${dest}`);
      }
    } else {
      fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    }
    if (vault.contentHash(fs.readFileSync(dest)) !== vault.contentHash(bytes)) throw new Error(`Copy verification failed: ${dest}`);
  }
}

function ensureDefaultProject(resource, queries, database) {
  if (!queries.getProjectById.get('default')) throw new Error('Default project missing');
  database.getDB().prepare('UPDATE resources SET project_id=? WHERE id=?').run('default', resource.id);
  resource.project_id = 'default';
}

function migrateLegacyFile(resource, deps) {
  const { fileStorage } = deps;
  const source = resource.internal_path
    ? path.join(fileStorage.getStorageDir(), resource.internal_path)
    : resource.file_path;
  if (!source || !fs.existsSync(source)) throw new Error(`Original file missing for ${resource.id}`);
  const imported = vault.importFileToVault(source, resource, deps);
  const expected = vault.contentHash(fs.readFileSync(source));
  if (vault.contentHash(fs.readFileSync(imported.absPath)) !== expected) throw new Error('Copy verification failed');
  deps.database.getDB().prepare('UPDATE resources SET vault_path=?,file_hash=?,content_hash=?,file_size=? WHERE id=?')
    .run(imported.vaultPath, expected, expected, imported.size, resource.id);
  return { success: true };
}

function dispatchLegacyMigration(resource, deps) {
  switch (resource.type) {
    case 'folder': return vault.createFolderOnDisk(resource.id, deps);
    case 'note': return vault.writeNoteMarkdown({ id: resource.id, markdown: legacyNoteMarkdown(resource) }, deps);
    case 'url': return vault.writeUrlMirror({ id: resource.id }, deps);
    case 'notebook': return vault.writeNotebookMirror({ id: resource.id }, deps);
    case 'artifact': return vault.writeArtifactHtmlMirror({ id: resource.id }, deps);
    default: return migrateLegacyFile(resource, deps);
  }
}

function migrateResource(resource, deps) {
  const { database, fileStorage } = deps;
  const queries = database.getQueries();
  if (!resource.project_id) ensureDefaultProject(resource, queries, database);
  const current = vault.getResourceFilePath(resource, queries, fileStorage);
  if (!current || !fs.existsSync(current)) {
    const result = dispatchLegacyMigration(resource, deps);
    if (!result.success) throw new Error(result.error || 'Migration failed');
  }
  if (resource.type === 'notebook') migrateNotebookDirectory(queries.getResourceById.get(resource.id), deps);
  const columns = legacyColumns(database.getDB());
  if (columns.length) database.getDB().prepare(`UPDATE resources SET ${columns.map((column) => `${column}=NULL`).join(',')} WHERE id=?`).run(resource.id);
}

function legacyColumns(db) {
  return db.prepare('PRAGMA table_info(resources)').all()
    .map((column) => column.name).filter((name) => name === 'file_path' || name === 'internal_path');
}

function pendingVaultResources(database) {
  const db = database.getDB();
  const predicates = legacyColumns(db).map((column) => `${column} IS NOT NULL`);
  predicates.push("vault_path IS NULL", "metadata LIKE '%notebook_workspace_path%'");
  return db.prepare(`SELECT * FROM resources WHERE ${predicates.join(' OR ')}
    ORDER BY CASE WHEN type='folder' THEN 0 ELSE 1 END, created_at`).all();
}

function migrateLegacyVault(deps) {
  const db = deps.database.getDB();
  const rows = pendingVaultResources(deps.database);
  const errors = [];
  let migrated = 0;
  // Keep a database snapshot alongside the untouched source files for recovery.
  if (rows.length) {
    const backupDir = path.join(deps.fileStorage.getStorageDir(), 'migration-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, 'before-vault-unification.sqlite');
    if (!fs.existsSync(backup)) db.prepare('VACUUM INTO ?').run(backup);
  }
  for (const row of rows) {
    try { migrateResource(row, deps); migrated += 1; }
    catch (error) { errors.push({ id: row.id, error: error.message }); }
  }
  if (!errors.length) {
    db.exec('DROP INDEX IF EXISTS idx_resources_internal_path');
    for (const column of legacyColumns(db)) db.exec(`ALTER TABLE resources DROP COLUMN ${column}`);
  }
  return { migrated, failed: errors.length, errors };
}

module.exports = { migrateLegacyVault, pendingVaultResources, legacyNoteMarkdown, copyVerifiedTree };
