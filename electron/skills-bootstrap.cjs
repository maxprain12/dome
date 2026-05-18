/* eslint-disable no-console */
/**
 * One-time seed: copies bundled SKILL.md packs to ~/.dome/skills/ on first boot
 * (or when a bundled skill is not yet present in the user dir).
 * Idempotent: never overwrites skills the user has already edited.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const BUNDLED_DIR = path.join(__dirname, 'skills', 'bundled');
const USER_SKILLS_DIR = path.join(os.homedir(), '.dome', 'skills');
const SEEDED_FLAG = 'skills_bundled_seeded_v5';

/**
 * @param {import('better-sqlite3').Database} db
 */
function seedBundledSkills(db) {
  try {
    const flagRow = db.prepare("SELECT value FROM settings WHERE key = ?").get(SEEDED_FLAG);
    if (flagRow?.value === '1') return;

    if (!fs.existsSync(BUNDLED_DIR)) return;

    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    const bundledEntries = fs.readdirSync(BUNDLED_DIR, { withFileTypes: true });
    let copied = 0;

    for (const ent of bundledEntries) {
      if (!ent.isDirectory()) continue;
      const destDir = path.join(USER_SKILLS_DIR, ent.name);
      if (fs.existsSync(destDir)) continue; // user already has this skill, don't overwrite

      const srcDir = path.join(BUNDLED_DIR, ent.name);
      copyDirRecursive(srcDir, destDir);
      copied += 1;
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, '1', ?)").run(
      SEEDED_FLAG,
      Date.now(),
    );

    if (copied > 0) {
      console.log(`[Skills] Seeded ${copied} bundled skill(s) to ${USER_SKILLS_DIR}`);
    }
  } catch (err) {
    console.warn('[Skills] Bootstrap failed (non-fatal):', err?.message);
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

module.exports = { seedBundledSkills };
