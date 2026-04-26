/* eslint-disable no-console */
/**
 * One-time migration: SQLite ai_skills -> ~/.dome/skills/<id>/SKILL.md
 */
const fs = require('fs');
const path = require('path');
const { ensurePersonalSkillsRoot } = require('./paths.cjs');

function yamlEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} queries
 * @param {string} userDataPath
 * @returns {{ migrated: number, skipped: boolean }}
 */
function migrateAiSkillsToFiles(db, queries, userDataPath) {
  let skipped = false;
  try {
    const row = queries.getSetting.get('skills_migrated_to_files');
    if (row?.value === '1') {
      skipped = true;
      return { migrated: 0, skipped };
    }
  } catch {
    /* ignore */
  }

  let rows = [];
  try {
    rows = queries.listAiSkills.all() || [];
  } catch {
    return { migrated: 0, skipped: true };
  }

  if (rows.length === 0) {
    try {
      queries.setSetting.run('skills_migrated_to_files', '1', Date.now());
    } catch {
      /* ignore */
    }
    return { migrated: 0, skipped: false };
  }

  const backupPath = path.join(userDataPath, 'ai_skills.backup.json');
  try {
    fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Skills] Could not write backup:', e?.message);
  }

  const personal = ensurePersonalSkillsRoot();
  let count = 0;
  for (const row of rows) {
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `skill_${count}`;
    const name = typeof row.name === 'string' ? row.name.trim() : id;
    const description = typeof row.description === 'string' ? row.description : '';
    const prompt = typeof row.prompt === 'string' ? row.prompt : '';
    const enabled = row.enabled === 0 ? 'true' : 'false';
    const dir = path.join(personal, id);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[Skills] mkdir', dir, e?.message);
      continue;
    }
    const descBlock = description.includes('\n')
      ? `description: |\n${description
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n')}\n`
      : `description: "${yamlEscape(description)}"\n`;
    const md = `---
name: ${id}
${descBlock}disable-model-invocation: ${enabled}
---

${prompt}
`;
    try {
      fs.writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf8');
      count += 1;
    } catch (e) {
      console.warn('[Skills] write SKILL.md', id, e?.message);
    }
  }

  try {
    queries.setSetting.run('skills_migrated_to_files', '1', Date.now());
  } catch {
    /* ignore */
  }
  return { migrated: count, skipped: false };
}

module.exports = { migrateAiSkillsToFiles };
