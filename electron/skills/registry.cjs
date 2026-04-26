/* eslint-disable no-console */
/**
 * In-memory skill registry. Priority: personal > project > plugin > bundled.
 */
const fs = require('fs');
const path = require('path');
const { parseSkillMarkdown } = require('./parser.cjs');
const {
  getPersonalSkillsRoot,
  getBundledSkillsRoot,
  getProjectSkillsRoot,
  getPluginsBaseDir,
  ensurePersonalSkillsRoot,
} = require('./paths.cjs');

/** @type {Map<string, import('./parser.cjs').parseSkillMarkdown extends Function ? any : any>} */
let skillsById = new Map();
/** @type {Map<string, string>} */ // slashName -> id (first wins in reverse priority, so re-build after merge)
const slashNameToId = new Map();
let _projectRoot = null;
let _app = null;

function setContext(app, projectRoot) {
  _app = app;
  _projectRoot = projectRoot;
}

/**
 * @returns {Array<{ type: 'bundled'|'project'|'plugin'|'personal', path: string, pluginId?: string }>}
 */
function collectWatchRoots() {
  const roots = [];
  const bundled = getBundledSkillsRoot();
  if (fs.existsSync(bundled)) {
    roots.push({ type: 'bundled', path: bundled });
  }
  if (_app) {
    const pluginsBase = getPluginsBaseDir(_app);
    if (fs.existsSync(pluginsBase)) {
      for (const ent of fs.readdirSync(pluginsBase, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const p = path.join(pluginsBase, ent.name, 'skills');
        if (fs.existsSync(p)) {
          roots.push({ type: 'plugin', path: p, pluginId: ent.name });
        }
      }
    }
  }
  const pr = getProjectSkillsRoot(_projectRoot);
  if (pr && fs.existsSync(pr)) {
    roots.push({ type: 'project', path: pr });
  }
  const personal = getPersonalSkillsRoot();
  ensurePersonalSkillsRoot();
  roots.push({ type: 'personal', path: personal });
  return roots;
}

/**
 * @param {string} root
 * @param {'bundled'|'project'|'plugin'|'personal'} scope
 * @param {string | null} pluginId
 */
function loadSkillsUnderRoot(root, scope, pluginId) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const dirName = ent.name;
    const skillFile = path.join(root, dirName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    let raw;
    try {
      raw = fs.readFileSync(skillFile, 'utf8');
    } catch (e) {
      console.warn('[Skills] read fail', skillFile, e?.message);
      continue;
    }
    let record;
    try {
      record = parseSkillMarkdown(dirName, raw, { scope, pluginId: pluginId || undefined });
      record.filePath = skillFile;
      record.dirPath = path.join(root, dirName);
    } catch (e) {
      console.warn('[Skills] parse fail', skillFile, e?.message);
      continue;
    }
    record.scope = scope;
    skillsById.set(record.id, record);
  }
}

function reload() {
  skillsById = new Map();
  // low priority first
  loadSkillsUnderRoot(getBundledSkillsRoot(), 'bundled', null);
  if (_app) {
    const pluginsBase = getPluginsBaseDir(_app);
    if (fs.existsSync(pluginsBase)) {
      for (const ent of fs.readdirSync(pluginsBase, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const skillsRoot = path.join(pluginsBase, ent.name, 'skills');
        loadSkillsUnderRoot(skillsRoot, 'plugin', ent.name);
      }
    }
  }
  const proj = getProjectSkillsRoot(_projectRoot);
  if (proj) {
    loadSkillsUnderRoot(proj, 'project', null);
  }
  loadSkillsUnderRoot(getPersonalSkillsRoot(), 'personal', null);

  // Build slashName index (higher scope overwrote id in map — last set wins for id; for slash we need highest scope)
  // Map already has correct id per priority because we load in order and personal overwrites.
  slashNameToId.clear();
  for (const [id, rec] of skillsById) {
    const key = (rec.slashName || rec.dirName).toLowerCase();
    if (!slashNameToId.has(key)) slashNameToId.set(key, id);
  }
  return skillsById.size;
}

/**
 * @param {string | null} projectRoot
 */
function setProjectRoot(projectRoot) {
  _projectRoot = projectRoot;
  return reload();
}

function getById(id) {
  return skillsById.get(id) || null;
}

/**
 * Resolve by directory id or slash name
 * @param {string} nameOrId
 */
function resolve(nameOrId) {
  if (!nameOrId) return null;
  const s = String(nameOrId).trim();
  if (skillsById.has(s)) return getById(s);
  const bySlash = slashNameToId.get(s.toLowerCase());
  if (bySlash) return getById(bySlash);
  return null;
}

function list() {
  return Array.from(skillsById.values());
}

function getAllIds() {
  return Array.from(skillsById.keys());
}

module.exports = {
  setContext,
  setProjectRoot,
  reload,
  getById,
  resolve,
  list,
  getAllIds,
  collectWatchRoots,
  getPersonalSkillsRoot,
  getBundledSkillsRoot,
  getProjectSkillsRoot,
  ensurePersonalSkillsRoot,
};
