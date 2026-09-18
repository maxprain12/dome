'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { listAllSkills } = require('../skills/index.cjs');
const { publicLabel } = require('./refs.cjs');

const MAX_BODY = 3200;
const MAX_SKILLS = 6;

function stripFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

function skillKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function buildSkillPromptOverlay(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return '';
  let listed = [];
  try {
    listed = await listAllSkills();
  } catch {
    return '';
  }
  const chunks = [];
  const seen = new Set();
  for (const skill of skills.slice(0, MAX_SKILLS)) {
    const name = publicLabel(skill?.name || skill?.title, '');
    const id = skillKey(skill?.id || name);
    if (!name || seen.has(id)) continue;
    const match = listed.find((row) => {
      const folder = row?.path ? path.basename(path.dirname(row.path)) : '';
      return (
        skillKey(row?.name) === skillKey(name)
        || skillKey(folder) === id
        || skillKey(row?.name) === id
      );
    });
    if (!match?.path) continue;
    let body = '';
    try {
      body = stripFrontmatter(fs.readFileSync(match.path, 'utf8'));
    } catch {
      continue;
    }
    if (!body) continue;
    seen.add(id);
    if (body.length > MAX_BODY) {
      body = `${body.slice(0, MAX_BODY)}…`;
    }
    chunks.push(`### ${name}\n${body}`);
  }
  if (chunks.length === 0) return '';
  return [
    '## Skills',
    chunks.join('\n\n'),
    '## Skill invocation note',
    'The user explicitly invoked the skill(s) above. Their SKILL.md bodies are already loaded — follow them for this run. Do NOT call skill_read for SKILL.md or search the library for /skill-name paths. Use skill_read only for auxiliary files referenced inside a skill.',
  ].join('\n');
}

function prependSystemOverlay(messages, overlay) {
  if (!overlay || !Array.isArray(messages) || messages.length === 0) return messages || [];
  const next = messages.map((row) => ({ ...row }));
  const system = next.find((row) => row && row.role === 'system');
  if (system && typeof system.content === 'string') {
    system.content = `${system.content}\n\n${overlay}`;
    return next;
  }
  return [{ role: 'system', content: overlay }, ...next];
}

module.exports = {
  buildSkillPromptOverlay,
  prependSystemOverlay,
};
