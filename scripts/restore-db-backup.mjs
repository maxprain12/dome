#!/usr/bin/env node
/**
 * List and restore dome.db from backups in %APPDATA%/dome (Windows) or equivalent.
 *
 * Usage:
 *   node scripts/restore-db-backup.mjs              # list backups
 *   node scripts/restore-db-backup.mjs --apply      # restore best candidate (prefers pre-migration, <400MB)
 *   node scripts/restore-db-backup.mjs --apply --from dome.db.backup-v41-...
 *   node scripts/restore-db-backup.mjs --purge-auto # delete dome.db.auto-* snapshots (Dome must be closed)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

function defaultUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'dome');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'dome');
  }
  return path.join(os.homedir(), '.config', 'dome');
}

function parseArgs(argv) {
  const dirFlag = argv.indexOf('--dir');
  const fromFlag = argv.indexOf('--from');
  return {
    userDataDir: dirFlag >= 0 ? argv[dirFlag + 1] : defaultUserDataDir(),
    apply: argv.includes('--apply'),
    purgeAuto: argv.includes('--purge-auto'),
    fromName: fromFlag >= 0 ? argv[fromFlag + 1] : null,
  };
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('dome.db.auto-') || f.startsWith('dome.db.backup-v'))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, full, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function pickBestBackup(backups) {
  if (backups.length === 0) return null;
  const preferredMax = 400 * 1024 * 1024;
  const migration = backups
    .filter((b) => b.name.startsWith('dome.db.backup-v') && b.size <= preferredMax)
    .sort((a, b) => b.mtime - a.mtime);
  if (migration.length > 0) return migration[0];
  const small = backups.filter((b) => b.size <= preferredMax).sort((a, b) => b.mtime - a.mtime);
  if (small.length > 0) return small[0];
  return backups.sort((a, b) => a.size - b.size)[0];
}

function removeSidecars(dbPath) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = dbPath + suffix;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
}

function printLockHelp() {
  console.error('\nDome (or Electron) still has dome.db open.');
  console.error('1. Quit Dome from the tray, or end every "Electron" / "Dome" process in Task Manager.');
  console.error('2. Wait a few seconds.');
  console.error('3. Run: pnpm run restore:db -- --apply');
  console.error('\nManual fallback (PowerShell, Dome closed):');
  console.error('  cd $env:APPDATA\\dome');
  console.error('  Remove-Item dome.db-wal,dome.db-shm -ErrorAction SilentlyContinue');
  console.error('  Rename-Item dome.db dome.db.old');
  console.error('  Copy-Item dome.db.backup-v41-* dome.db');
}

function warnIfDomeMaybeRunning() {
  if (process.platform !== 'win32') return;
  const names = ['electron.exe', 'Dome.exe'];
  for (const image of names) {
    try {
      const out = execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' });
      if (out.trim() && !out.includes('INFO: No tasks')) {
        console.warn(`Warning: ${image} is running — close Dome before restore.`);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Replace live dome.db without overwriting in place (Windows locks open files).
 * Renames the live file aside, then copies the backup into place.
 */
function replaceDatabaseFile(dbPath, sourcePath, userDataDir) {
  removeSidecars(dbPath);

  let asidePath = null;
  if (fs.existsSync(dbPath)) {
    asidePath = path.join(userDataDir, `dome.db.before-restore-${Date.now()}`);
    try {
      fs.renameSync(dbPath, asidePath);
      const mb = (fs.statSync(asidePath).size / 1024 / 1024).toFixed(0);
      console.log(`Moved current db aside: ${path.basename(asidePath)} (${mb} MB)`);
      console.log('You can delete that file after confirming Dome works.');
    } catch (err) {
      printLockHelp();
      throw err;
    }
  }

  try {
    fs.copyFileSync(sourcePath, dbPath);
    removeSidecars(dbPath);
  } catch (err) {
    if (asidePath && fs.existsSync(asidePath) && !fs.existsSync(dbPath)) {
      fs.renameSync(asidePath, dbPath);
      console.error('Restore failed; reverted to previous dome.db.');
    }
    throw err;
  }
}

function main() {
  const { userDataDir, apply, purgeAuto, fromName } = parseArgs(process.argv.slice(2));
  const dbPath = path.join(userDataDir, 'dome.db');
  const backups = listBackups(userDataDir);

  console.log('Dome database restore helper');
  console.log(`User data: ${userDataDir}`);
  if (fs.existsSync(dbPath)) {
    const live = fs.statSync(dbPath);
    console.log(`Live dome.db: ${(live.size / 1024 / 1024).toFixed(1)} MB`);
  } else {
    console.log('Live dome.db: (missing)');
  }

  console.log('\nBackups:');
  if (backups.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const b of backups) {
    console.log(`  ${b.name} — ${(b.size / 1024 / 1024).toFixed(1)} MB`);
  }

  const candidate = fromName
    ? backups.find((b) => b.name === fromName || b.name.includes(fromName))
    : pickBestBackup(backups);

  if (purgeAuto) {
    const auto = backups.filter((b) => b.name.startsWith('dome.db.auto-'));
    let freed = 0;
    for (const b of auto) {
      fs.unlinkSync(b.full);
      freed += b.size;
    }
    console.log(`\nDeleted ${auto.length} auto backup(s), freed ${(freed / 1024 / 1024).toFixed(0)} MB`);
    return;
  }

  if (!apply) {
    warnIfDomeMaybeRunning();
    console.log('\nDry run. Close Dome, then run:');
    console.log('  pnpm run restore:db -- --apply');
    if (candidate) {
      console.log(`Recommended: ${candidate.name} (${(candidate.size / 1024 / 1024).toFixed(1)} MB)`);
    }
    console.log('To free disk from bloated auto snapshots:');
    console.log('  pnpm run restore:db -- --purge-auto');
    return;
  }

  if (!candidate) {
    console.error('No matching backup found.');
    process.exit(1);
  }

  warnIfDomeMaybeRunning();

  try {
    replaceDatabaseFile(dbPath, candidate.full, userDataDir);
  } catch (err) {
    console.error(`\nRestore failed: ${err?.message || err}`);
    process.exit(1);
  }

  console.log(`Restored ${candidate.name} → dome.db`);
  console.log('Restart Dome with: pnpm run electron:dev');
}

main();
