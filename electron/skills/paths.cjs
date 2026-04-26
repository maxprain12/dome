/* eslint-disable no-console */
/**
 * Resolve skill root directories: personal (~/.dome/skills), project (.dome/skills), bundled, plugins.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const PERSONAL_REL = ['.dome', 'skills'];

/**
 * ~/.dome/skills — user skills (highest priority)
 */
function getPersonalSkillsRoot() {
  return path.join(os.homedir(), ...PERSONAL_REL);
}

/**
 * Bundled skills shipped with the app (electron/skills/bundled)
 */
function getBundledSkillsRoot() {
  return path.join(__dirname, 'bundled');
}

/**
 * Project skills: .dome/skills under an optional project root (from settings or env).
 * @param {string | null} projectRoot - absolute path to workspace root
 */
function getProjectSkillsRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return null;
  const trimmed = projectRoot.trim();
  if (!trimmed) return null;
  return path.join(trimmed, '.dome', 'skills');
}

/**
 * userData/plugins/<id>/skills/... (per plugin)
 */
function getPluginsBaseDir(app) {
  return path.join(app.getPath('userData'), 'plugins');
}

/**
 * Ensure personal root exists (empty is ok)
 */
function ensurePersonalSkillsRoot() {
  const root = getPersonalSkillsRoot();
  if (!fs.existsSync(root)) {
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch (e) {
      console.warn('[Skills] Could not mkdir personal skills dir:', e?.message);
    }
  }
  return root;
}

module.exports = {
  getPersonalSkillsRoot,
  getBundledSkillsRoot,
  getProjectSkillsRoot,
  getPluginsBaseDir,
  ensurePersonalSkillsRoot,
};
