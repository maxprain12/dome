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
  LATEST_SCHEMA_VERSION,
} = require('../core/migration-backup.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-migration-backup');

describe('migration-backup', () => {
  it('creates backup when schema is behind latest', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.db');
    fs.writeFileSync(dbPath, 'sqlite-placeholder');
    const backup = backupDatabaseBeforeMigrations(dbPath, 0);
    assert.ok(backup);
    assert.ok(fs.existsSync(backup));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips backup when schema is current', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.db');
    fs.writeFileSync(dbPath, 'sqlite-placeholder');
    const backup = backupDatabaseBeforeMigrations(dbPath, LATEST_SCHEMA_VERSION);
    assert.equal(backup, null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('restores db from backup and removes stale wal/shm sidecars', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'dome.db');
    fs.writeFileSync(dbPath, 'original-content');
    const backup = backupDatabaseBeforeMigrations(dbPath, 0);
    assert.ok(backup);

    // Simulate a half-applied migration corrupting the db.
    fs.writeFileSync(dbPath, 'corrupted-by-failed-migration');
    fs.writeFileSync(`${dbPath}-wal`, 'stale wal');
    fs.writeFileSync(`${dbPath}-shm`, 'stale shm');

    const restored = restoreDatabaseFromBackup(dbPath, backup);
    assert.equal(restored, true);
    assert.equal(fs.readFileSync(dbPath, 'utf8'), 'original-content');
    assert.equal(fs.existsSync(`${dbPath}-wal`), false);
    assert.equal(fs.existsSync(`${dbPath}-shm`), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when backup file is missing', () => {
    const restored = restoreDatabaseFromBackup('/tmp/nonexistent-db', '/tmp/nonexistent-backup');
    assert.equal(restored, false);
  });
});
