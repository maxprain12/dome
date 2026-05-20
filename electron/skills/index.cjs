/* eslint-disable no-console */
/**
 * Thin wrapper over deepagents `listSkills` / `createSkillsMiddleware`.
 * Single source of truth for the user skills directory path.
 */
const path = require('path');
const os = require('os');

const USER_SKILLS_DIR = path.join(os.homedir(), '.dome', 'skills');

function userSkillsDir() {
  return USER_SKILLS_DIR;
}

/**
 * List all skills from the user skills directory.
 * Uses deepagents.listSkills which reads SKILL.md frontmatter synchronously.
 * @returns {Promise<Array<import('deepagents').SkillMetadata>>}
 */
async function listAllSkills() {
  try {
    const { listSkills } = await import('deepagents');
    return listSkills({ userSkillsDir: USER_SKILLS_DIR, projectSkillsDir: null });
  } catch (err) {
    console.warn('[Skills] listAllSkills failed:', err?.message);
    return [];
  }
}

/**
 * Build a createSkillsMiddleware instance backed by the user skills directory.
 * Must be called inside an async context (uses dynamic ESM import).
 * @returns {Promise<import('deepagents').AgentMiddleware>}
 */
async function buildSkillsMiddleware() {
  const { createSkillsMiddleware, FilesystemBackend } = await import('deepagents');
  return createSkillsMiddleware({
    backend: new FilesystemBackend({ rootDir: os.homedir() }),
    sources: [USER_SKILLS_DIR],
  });
}

module.exports = { userSkillsDir, listAllSkills, buildSkillsMiddleware };
