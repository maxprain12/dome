import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  createAutomaticBackup,
  findLatestBackup,
  restoreFromLatestBackup,
  preflightRestoreIfCorrupt,
  listAllBackups,
  AUTO_BACKUP_PREFIX,
  MIGRATION_BACKUP_PREFIX,
  MAX_AUTO_BACKUPS,
  verifyDatabaseFile,
} = require('../core/db-backup.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-db-backup');

/**
 * Create a real DuckDB file at `name` so verifyDatabaseFile (the DuckDB probe)
 * will pass. Returns the absolute path.
 */
async function writeDuckDbFile(dir, name = 'dome.duckdb') {
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(`${dbPath}.wal`)) fs.unlinkSync(`${dbPath}.wal`);

  const { openDuckDb } = require('../core/db/duckdb.cjs');
  const db = await openDuckDb(dbPath);
  try {
    await db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY)');
    await db.run('INSERT INTO projects (id) VALUES (?)', ['test']);
  } finally {
    await db.close();
  }
  return dbPath;
}

function cleanup() {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('db-backup', () => {
  it('createAutomaticBackup writes auto snapshot and prunes old ones', async () => {
    cleanup();
    const dbPath = await writeDuckDbFile(tmpDir);

    for (let i = 0; i < MAX_AUTO_BACKUPS + 2; i += 1) {
      await createAutomaticBackup(null, dbPath, `test-${i}`, { force: true });
    }

    const autoBackups = listAllBackups(tmpDir).filter((b) => b.name.startsWith(AUTO_BACKUP_PREFIX));
    assert.equal(autoBackups.length, MAX_AUTO_BACKUPS);
    cleanup();
  });

  it('restoreFromLatestBackup replaces corrupt db with newest backup', async () => {
    cleanup();
    const dbPath = await writeDuckDbFile(tmpDir, 'dome.duckdb');
    await createAutomaticBackup(null, dbPath, 'golden', { force: true });
    fs.writeFileSync(dbPath, 'corrupted-content');

    const result = await restoreFromLatestBackup(dbPath);
    assert.equal(result.restored, true);
    const check = await verifyDatabaseFile(dbPath);
    assert.equal(check.ok, true);
    cleanup();
  });

  it('createAutomaticBackup skips when source database exceeds size cap', async () => {
    cleanup();
    await writeDuckDbFile(tmpDir);
    const { MAX_AUTO_BACKUP_SOURCE_BYTES } = require('../core/db-backup.cjs');
    const bigPath = path.join(tmpDir, 'dome-big.duckdb');
    fs.writeFileSync(bigPath, Buffer.alloc(MAX_AUTO_BACKUP_SOURCE_BYTES + 1, 0));
    const result = await createAutomaticBackup(null, bigPath, 'huge', { force: true });
    assert.equal(result, null);
    cleanup();
  });

  it('verifyDatabaseFile rejects non-DuckDB files', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const fakePath = path.join(tmpDir, 'fake.duckdb');
    fs.writeFileSync(fakePath, 'SQLite format 3\x00test');
    const check = await verifyDatabaseFile(fakePath);
    assert.equal(check.ok, false);
    cleanup();
  });

  it('findLatestBackup returns null when no valid backup exists', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const fake = path.join(tmpDir, `${AUTO_BACKUP_PREFIX}fake-2020`);
    fs.writeFileSync(fake, 'not-a-backup');
    assert.equal(await findLatestBackup(tmpDir), null);
    cleanup();
  });
});
