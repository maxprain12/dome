/* eslint-disable no-console */
/**
 * Skills bootstrap: ensure ~/.dome/skills exists and migrate legacy userData/skills.
 *
 * DuckDB migration: all DB access is async (`await db.get/all/run`).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const USER_SKILLS_DIR = path.join(os.homedir(), '.dome', 'skills');
const SEEDED_FLAG = 'skills_bundled_seeded_v6';
const MIGRATED_FLAG = 'skills_migrated_userdata_v1';

function getLegacySkillsDir() {
  try {
    return path.join(app.getPath('userData'), 'skills');
  } catch (_) {
    return null;
  }
}

function copyDirRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyDirRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function migrateLegacySkills(db) {
  try {
    const flagRow = await db.get('SELECT value FROM settings WHERE key = ?', [MIGRATED_FLAG]);
    if (flagRow?.value === '1') return;

    const legacyDir = getLegacySkillsDir();
    if (!legacyDir || !fs.existsSync(legacyDir)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        [MIGRATED_FLAG, '1', Date.now()],
      );
      return;
    }

    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(legacyDir, entry.name);
      const dest = path.join(USER_SKILLS_DIR, entry.name);
      if (fs.existsSync(dest)) continue;
      copyDirRecursive(src, dest);
      console.log(`[Skills] Migrated legacy skill: ${entry.name}`);
    }

    await db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      [MIGRATED_FLAG, '1', Date.now()],
    );
  } catch (err) {
    console.warn('[Skills] Legacy migration failed (non-fatal):', err?.message);
  }
}

/**
 * @param {import('./db/duckdb.cjs').DuckDbConnection} db
 */
function repairSkillDirectoriesOnce() {
  try {
    const { repairSkillDirectoryNames } = require('../skills/install.cjs');
    repairSkillDirectoryNames();
  } catch (err) {
    console.warn('[Skills] Directory repair failed (non-fatal):', err?.message || err);
  }
}

/**
 * @param {import('./db/duckdb.cjs').DuckDbConnection} db
 */
async function seedBundledSkills(db) {
  try {
    await migrateLegacySkills(db);
    repairSkillDirectoriesOnce();

    const flagRow = await db.get('SELECT value FROM settings WHERE key = ?', [SEEDED_FLAG]);
    if (flagRow?.value === '1') return;

    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    await db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      [SEEDED_FLAG, '1', Date.now()],
    );
  } catch (err) {
    console.warn('[Skills] Bootstrap failed (non-fatal):', err?.message);
  }
}

module.exports = { seedBundledSkills };
