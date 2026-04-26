/* eslint-disable no-console */
/**
 * Append enabled skills (by id) to a system prompt — source: file registry (SKILL.md).
 */
const registry = require('./skills/registry.cjs');
const { renderSkillBody } = require('./skills/renderer.cjs');

function getDisableShellFromQueries(queries) {
  if (!queries?.getSetting) return false;
  try {
    const row = queries.getSetting.get('disable_skill_shell_execution');
    return row?.value === '1' || row?.value === 'true';
  } catch {
    return false;
  }
}

function appendSkillsToPrompt(basePrompt, skillIds, queries) {
  const text = String(basePrompt || '');
  if (!skillIds || skillIds.length === 0) return text;
  const disableShell = getDisableShellFromQueries(queries);
  const chunks = [];
  for (const id of skillIds) {
    if (typeof id !== 'string') continue;
    const rec = registry.getById(id) || registry.resolve(id);
    if (!rec) continue;
    const body = renderSkillBody(rec.body, {
      argumentsLine: '',
      namedArgs: rec.arguments,
      sessionId: '',
      skillDir: rec.dirPath,
      shell: rec.shell,
      disableSkillShellExecution: disableShell,
    });
    if (!String(body).trim()) continue;
    const title = rec.name || 'Skill';
    chunks.push(`### ${title}\n${body}\n`);
  }
  if (chunks.length === 0) return text;
  return `${text}\n\n## Skills\n${chunks.join('\n')}`;
}

function getToolName(def) {
  if (!def || typeof def !== 'object') return null;
  if (def.function?.name) return String(def.function.name);
  if (def.name) return String(def.name);
  return null;
}

/**
 * Filter OpenAI-format tool definitions by the union of `allowed_tools`
 * declared by any of the active skills. If no active skill declares
 * `allowed_tools`, the array is returned unchanged.
 *
 * @param {string[]} skillIds
 * @param {Array<{ type?: string, function?: { name?: string }, name?: string }>} toolDefinitions
 * @returns {Array} filtered tool definitions (same shape as input)
 */
function filterToolsBySkill(skillIds, toolDefinitions) {
  if (!Array.isArray(toolDefinitions) || toolDefinitions.length === 0) return toolDefinitions || [];
  if (!Array.isArray(skillIds) || skillIds.length === 0) return toolDefinitions;
  const allowed = new Set();
  let anyDeclared = false;
  for (const id of skillIds) {
    if (typeof id !== 'string') continue;
    const rec = registry.getById(id) || registry.resolve(id);
    if (!rec || !Array.isArray(rec.allowed_tools) || rec.allowed_tools.length === 0) continue;
    anyDeclared = true;
    for (const t of rec.allowed_tools) {
      if (typeof t === 'string' && t.trim()) allowed.add(t.trim());
    }
  }
  if (!anyDeclared) return toolDefinitions;
  return toolDefinitions.filter((def) => {
    const name = getToolName(def);
    return name != null && allowed.has(name);
  });
}

module.exports = { appendSkillsToPrompt, filterToolsBySkill };
