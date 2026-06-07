/* eslint-disable no-console */
/**
 * Native skills discovery via `@dome/agent-core` (SKILL.md loader).
 * Single source of truth for the user skills directory path.
 */
const path = require('path');
const os = require('os');

const USER_SKILLS_DIR =
  process.env.DOME_SKILLS_DIR || path.join(os.homedir(), '.dome', 'skills');

function userSkillsDir() {
  return USER_SKILLS_DIR;
}

/**
 * List all skills from the user skills directory.
 * @returns {Promise<Array<{ name: string, description: string, path: string }>>}
 */
async function listAllSkills() {
  try {
    const core = await import('@dome/agent-core');
    const { NodeExecutionEnv } = await import('@dome/agent-core/node');
    const dir = userSkillsDir();
    const env = new NodeExecutionEnv({ cwd: dir });
    const { skills, diagnostics } = await core.loadSkills(env, dir);
    for (const d of diagnostics) {
      console.warn(`[Skills] ${d.code}: ${d.message} (${d.path})`);
    }
    return skills.map((s) => ({
      name: s.name,
      description: s.description,
      path: s.filePath,
    }));
  } catch (err) {
    console.warn('[Skills] listAllSkills failed:', err?.message);
    return [];
  }
}

module.exports = { userSkillsDir, listAllSkills };
