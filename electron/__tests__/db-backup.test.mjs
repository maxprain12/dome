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
  MAX_AUTO_BACKUPS,
} = require('../core/db-backup.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-db-backup');

function writeDbFile(dir, name = 'dome.db', content = 'SQLite format 3\x00test-db') {
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, name);
  fs.writeFileSync(dbPath, content);
  return dbPath;
}

describe('db-backup', () => {
  it('createAutomaticBackup writes auto snapshot and prunes old ones', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = writeDbFile(tmpDir);

    for (let i = 0; i < MAX_AUTO_BACKUPS + 2; i += 1) {
      createAutomaticBackup(null, dbPath, `test-${i}`, { force: true });
    }

    const autoBackups = listAllBackups(tmpDir).filter((b) => b.name.startsWith(AUTO_BACKUP_PREFIX));
    assert.equal(autoBackups.length, MAX_AUTO_BACKUPS);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('findLatestBackup prefers verified candidate under size cap', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = writeDbFile(tmpDir);
    const older = path.join(tmpDir, `${AUTO_BACKUP_PREFIX}old-2020-01-01`);
    const newer = path.join(tmpDir, 'dome.db.backup-v1-newer');
    fs.writeFileSync(older, 'SQLite format 3\x00old');
    fs.writeFileSync(newer, 'SQLite format 3\x00new');
    const now = Date.now();
    fs.utimesSync(older, now / 1000, (now - 20_000) / 1000);
    fs.utimesSync(newer, now / 1000, now / 1000);
    assert.equal(findLatestBackup(tmpDir), newer);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    void dbPath;
  });

  it('restoreFromLatestBackup replaces corrupt db with newest backup', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = writeDbFile(tmpDir, 'dome.db', 'SQLite format 3\x00good-content');
    createAutomaticBackup(null, dbPath, 'golden', { force: true });
    fs.writeFileSync(dbPath, 'corrupted-content');
    fs.writeFileSync(`${dbPath}-wal`, 'wal');

    const result = restoreFromLatestBackup(dbPath);
    assert.equal(result.restored, true);
    assert.equal(fs.readFileSync(dbPath, 'utf8'), 'SQLite format 3\x00good-content');
    assert.equal(fs.existsSync(`${dbPath}-wal`), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createAutomaticBackup skips when source database exceeds size cap', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = writeDbFile(tmpDir);
    const { MAX_AUTO_BACKUP_SOURCE_BYTES } = require('../core/db-backup.cjs');
    const bigPath = path.join(tmpDir, 'dome-big.db');
    fs.writeFileSync(bigPath, Buffer.alloc(MAX_AUTO_BACKUP_SOURCE_BYTES + 1, 0));
    const result = createAutomaticBackup(null, bigPath, 'huge', { force: true });
    assert.equal(result, null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    void dbPath;
  });

  it('preflightRestoreIfCorrupt restores when db file is not valid sqlite', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = writeDbFile(tmpDir, 'dome.db', 'SQLite format 3\x00good-content');
    createAutomaticBackup(null, dbPath, 'golden', { force: true });
    fs.writeFileSync(dbPath, 'not-a-database');

    const restored = preflightRestoreIfCorrupt(dbPath);
    assert.equal(restored, true);
    assert.notEqual(fs.readFileSync(dbPath, 'utf8'), 'not-a-database');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
