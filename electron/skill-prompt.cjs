/* eslint-disable no-console */
/**
 * Append enabled AI skills (from ai_skills) to a system prompt, matching Agent Chat formatting.
 */

function appendSkillsToPrompt(basePrompt, skillIds, queries) {
  const text = String(basePrompt || '');
  if (!skillIds || skillIds.length === 0 || !queries?.listAiSkills) return text;
  let rows = [];
  try {
    rows = queries.listAiSkills.all() ?? [];
  } catch {
    return text;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chunks = [];
  for (const id of skillIds) {
    if (typeof id !== 'string') continue;
    const row = byId.get(id);
    if (!row || row.enabled === 0) continue;
    const body = String(row.prompt || '').trim();
    if (!body) continue;
    const title = row.name || 'Skill';
    chunks.push(`### ${title}\n${body}\n`);
  }
  if (chunks.length === 0) return text;
  return `${text}\n\n## Skills\n${chunks.join('\n')}`;
}

module.exports = { appendSkillsToPrompt };
