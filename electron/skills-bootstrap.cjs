/* eslint-disable no-console */
/**
 * One-time seed: copies bundled SKILL.md packs to ~/.dome/skills/ on first boot
 * (or when a bundled skill is not yet present in the user dir).
 * Idempotent: never overwrites skills the user has already edited.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const USER_SKILLS_DIR = path.join(os.homedir(), '.dome', 'skills');
// v6: no bundled skills — users install skills from marketplace or GitHub repos
const SEEDED_FLAG = 'skills_bundled_seeded_v6';

/**
 * @param {import('better-sqlite3').Database} db
 */
function seedBundledSkills(db) {
  try {
    const flagRow = db.prepare("SELECT value FROM settings WHERE key = ?").get(SEEDED_FLAG);
    if (flagRow?.value === '1') return;

    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, '1', ?)").run(
      SEEDED_FLAG,
      Date.now(),
    );
  } catch (err) {
    console.warn('[Skills] Bootstrap failed (non-fatal):', err?.message);
  }
}

module.exports = { seedBundledSkills };
