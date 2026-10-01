'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function userSkillsDir() {
  return process.env.DOME_SKILLS_DIR || path.join(os.homedir(), '.dome', 'skills');
}
function projectSkillsRoot(projectPath) {
  if (projectPath) return path.join(path.resolve(projectPath), '.dome', 'skills');
  try {
    const database = require('../core/database.cjs');
    const id = database.getQueries().getSetting.get('last_project_id')?.value;
    const root = require('../personality/context-files.cjs').resolveProjectVaultRoot(id);
    return root ? path.join(root, '.dome', 'skills') : null;
  } catch { return null; }
}
function skillRoots(projectPath) {
  return [{ source: 'project', path: projectSkillsRoot(projectPath) },
    { source: 'global', path: userSkillsDir() }].filter((root) => root.path);
}
function skillId(root, filePath) {
  const relative = path.relative(root.path, filePath).split(path.sep).join('/');
  if (root.source === 'global' && /^[^/]+\/SKILL\.md$/.test(relative)) return relative.split('/')[0];
  return `${root.source}:${relative}`;
}
async function loadSkillCatalog(projectPath) {
  const core = await import('@dome/agent-core');
  const { NodeExecutionEnv } = await import('@dome/agent-core/node');
  const skills = [], diagnostics = [], names = new Set(), files = new Set();
  for (const root of skillRoots(projectPath)) {
    if (!fs.existsSync(root.path)) continue;
    const canonicalRoot = fs.realpathSync(root.path);
    const confined = (file) => {
      const canonical = fs.realpathSync(file);
      return canonical === canonicalRoot || canonical.startsWith(`${canonicalRoot}${path.sep}`);
    };
    const env = new NodeExecutionEnv({ cwd: root.path });
    const listDir = env.listDir.bind(env);
    const readTextFile = env.readTextFile.bind(env);
    const visited = new Set();
    env.listDir = async (dir, signal) => {
      const canonical = fs.realpathSync(dir);
      if (visited.has(canonical)) return { ok: true, value: [] };
      visited.add(canonical);
      const result = await listDir(dir, signal);
      if (result.ok) result.value = result.value.filter((entry) => {
        try {
          if (confined(entry.path)) return true;
          diagnostics.push({ type: 'warning', code: 'invalid_metadata', path: entry.path, message: 'Skill path escapes its registered root' });
        } catch { /* dangling symlink */ }
        return false;
      });
      return result;
    };
    env.readTextFile = async (file, signal) => {
      if (!confined(file)) return { ok: false, error: { code: 'permission_denied', message: 'Skill path escapes its registered root' } };
      return readTextFile(file, signal);
    };
    const loaded = await core.loadSkills(env, root.path);
    diagnostics.push(...loaded.diagnostics);
    for (const skill of loaded.skills) {
      const canonical = fs.realpathSync(skill.filePath);
      if (!canonical.startsWith(`${canonicalRoot}${path.sep}`)) {
        diagnostics.push({ type: 'warning', code: 'invalid_metadata', path: skill.filePath, message: 'Skill escapes its registered root' });
        continue;
      }
      if (files.has(canonical)) continue;
      files.add(canonical);
      if (names.has(skill.name.toLowerCase())) {
        diagnostics.push({ type: 'warning', code: 'invalid_metadata', path: skill.filePath, message: `Skill name collision: ${skill.name}; first source wins` });
        continue;
      }
      names.add(skill.name.toLowerCase());
      skills.push({ ...skill, id: skillId(root, skill.filePath), source: root.source, canonicalPath: canonical });
    }
  }
  return { skills, diagnostics };
}
async function listAllSkills(projectPath) {
  const { skills, diagnostics } = await loadSkillCatalog(projectPath);
  for (const d of diagnostics) console.warn(`[Skills] ${d.code}: ${d.message} (${d.path})`);
  return skills.map((s) => ({ id: s.id, name: s.name, description: s.description, path: s.filePath,
    canonicalPath: s.canonicalPath, source: s.source, disableModelInvocation: s.disableModelInvocation }));
}
function readRegisteredSkillFile(skillIdValue, relativePath, projectPath) {
  const match = /^(project|global):(.+)$/.exec(String(skillIdValue));
  const root = match ? skillRoots(projectPath).find((item) => item.source === match[1])?.path : userSkillsDir();
  if (!root) throw new Error('Skill source is unavailable');
  const skillFile = match ? path.resolve(root, match[2]) : path.resolve(root, String(skillIdValue), 'SKILL.md');
  const canonicalRoot = fs.realpathSync(root);
  const canonicalSkill = fs.realpathSync(skillFile);
  if (!canonicalSkill.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error('Skill escapes its registered root');
  const skillDir = path.dirname(canonicalSkill);
  const target = relativePath === 'SKILL.md' ? canonicalSkill : path.resolve(skillDir, String(relativePath || 'SKILL.md'));
  const file = fs.realpathSync(target);
  if (!file.startsWith(`${skillDir}${path.sep}`)) throw new Error('Path escapes skill directory');
  if (!fs.statSync(file).isFile()) throw new Error('Not a skill file');
  return fs.readFileSync(file, 'utf8');
}
module.exports = { userSkillsDir, listAllSkills, loadSkillCatalog, readRegisteredSkillFile, skillRoots };
