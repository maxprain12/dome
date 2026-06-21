import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  backupDatabaseBeforeMigrations,
  restoreDatabaseFromBackup,
  removeWalSidecars,
  findLatestPreMigrationBackup,
  isSqliteIoError,
  LATEST_SCHEMA_VERSION,
  MIGRATION_BACKUP_PREFIX,
} = require('../core/migration-backup.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-migration-backup');

describe('migration-backup (duckdb)', () => {
  it('creates backup when schema is behind latest', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.duckdb');
    fs.writeFileSync(dbPath, 'duckdb-placeholder');
    const backup = backupDatabaseBeforeMigrations(dbPath, 0);
    assert.ok(backup);
    assert.ok(fs.existsSync(backup));
    assert.ok(path.basename(backup).startsWith(MIGRATION_BACKUP_PREFIX), `unexpected basename: ${backup}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips backup when schema is current', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.duckdb');
    fs.writeFileSync(dbPath, 'duckdb-placeholder');
    const backup = backupDatabaseBeforeMigrations(dbPath, LATEST_SCHEMA_VERSION);
    assert.equal(backup, null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('restores db from backup and removes stale .wal sidecar', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.duckdb');
    fs.writeFileSync(dbPath, 'original-content');
    const backup = backupDatabaseBeforeMigrations(dbPath, 0);
    assert.ok(backup);

    // Simulate a half-applied migration corrupting the db.
    fs.writeFileSync(dbPath, 'corrupted-by-failed-migration');
    fs.writeFileSync(`${dbPath}.wal`, 'stale wal');

    const restored = restoreDatabaseFromBackup(dbPath, backup);
    assert.equal(restored, true);
    assert.equal(fs.readFileSync(dbPath, 'utf8'), 'original-content');
    assert.equal(fs.existsSync(`${dbPath}.wal`), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when backup file is missing', () => {
    const restored = restoreDatabaseFromBackup('/tmp/nonexistent-db.duckdb', '/tmp/nonexistent-backup');
    assert.equal(restored, false);
  });

  it('removeWalSidecars deletes the .wal sidecar only (duckdb has no -shm)', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.duckdb');
    fs.writeFileSync(dbPath, 'db');
    fs.writeFileSync(`${dbPath}.wal`, 'wal');
    assert.equal(removeWalSidecars(dbPath), 1);
    assert.equal(fs.existsSync(`${dbPath}.wal`), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('findLatestPreMigrationBackup returns newest duckdb backup file', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const older = path.join(tmpDir, `${MIGRATION_BACKUP_PREFIX}1-old`);
    const newer = path.join(tmpDir, `${MIGRATION_BACKUP_PREFIX}2-new`);
    fs.writeFileSync(older, 'old');
    fs.writeFileSync(newer, 'new');
    const now = Date.now();
    fs.utimesSync(older, now / 1000, (now - 10_000) / 1000);
    fs.utimesSync(newer, now / 1000, now / 1000);
    assert.equal(findLatestPreMigrationBackup(tmpDir), newer);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isSqliteIoError detects SQLITE_IOERR codes', () => {
    assert.equal(isSqliteIoError({ code: 'SQLITE_IOERR_TRUNCATE' }), true);
    assert.equal(isSqliteIoError({ message: 'disk I/O error' }), true);
    assert.equal(isSqliteIoError({ code: 'SQLITE_BUSY' }), false);
  });
});
