/* eslint-disable no-console */
/**
 * Skills bootstrap: ensure ~/.dome/skills exists and migrate legacy userData/skills.
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

function migrateLegacySkills(db) {
  try {
    const flagRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(MIGRATED_FLAG);
    if (flagRow?.value === '1') return;

    const legacyDir = getLegacySkillsDir();
    if (!legacyDir || !fs.existsSync(legacyDir)) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        MIGRATED_FLAG,
        '1',
        Date.now(),
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

    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      MIGRATED_FLAG,
      '1',
      Date.now(),
    );
  } catch (err) {
    console.warn('[Skills] Legacy migration failed (non-fatal):', err?.message);
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function seedBundledSkills(db) {
  try {
    migrateLegacySkills(db);

    const flagRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(SEEDED_FLAG);
    if (flagRow?.value === '1') return;

    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      SEEDED_FLAG,
      '1',
      Date.now(),
    );
  } catch (err) {
    console.warn('[Skills] Bootstrap failed (non-fatal):', err?.message);
  }
}

module.exports = { seedBundledSkills };
