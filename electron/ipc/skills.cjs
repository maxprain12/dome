/* eslint-disable no-console */
/**
 * IPC: native skills backed by deepagents listSkills.
 * Channels: skills:list, skills:openFolder, skills:installBundled,
 *           skills:add, skills:browseRepo, skills:remove, skills:readFile.
 */
const path = require('node:path');
const fs = require('node:fs');
const { shell } = require('electron');
const { listAllSkills, userSkillsDir } = require('../skills/index.cjs');
const skillInstall = require('../skills/install.cjs');

/**
 * @param {object} param0
 */
function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('skills:list', async (event) => {
    try {
      validateSender(event, windowManager);
      const skills = await listAllSkills();
      const data = skills.map((s) => ({
        id: s.name,
        name: s.name,
        slug: s.name,
        description: s.description || '',
        path: s.path,
      }));
      return { success: true, data };
    } catch (err) {
      console.error('[Skills] list:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:openFolder', async (event) => {
    try {
      validateSender(event, windowManager);
      await shell.openPath(userSkillsDir());
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:installBundled', async (event, id) => {
    try {
      validateSender(event, windowManager);
      if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
        return { success: false, error: 'Invalid skill id' };
      }
      const bundledPath = path.join(__dirname, '..', 'skills', 'bundled', id, 'SKILL.md');
      if (!fs.existsSync(bundledPath)) {
        return { success: false, error: 'Bundled skill not found' };
      }
      const destDir = path.join(userSkillsDir(), id);
      const destFile = path.join(destDir, 'SKILL.md');
      fs.mkdirSync(destDir, { recursive: true });
      const content = fs.readFileSync(bundledPath, 'utf8');
      fs.writeFileSync(destFile, content, 'utf8');
      return { success: true };
    } catch (err) {
      console.error('[Skills] installBundled:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:add', async (event, { source, skillNames, overwrite }) => {
    try {
      validateSender(event, windowManager);
      if (!source || typeof source !== 'string') {
        return { success: false, error: 'Invalid source URL' };
      }
      const names = Array.isArray(skillNames)
        ? skillNames.filter((n) => typeof n === 'string' && n.trim())
        : undefined;
      const data = await skillInstall.installSkillsFromRepo({
        repoUrl: source.trim(),
        skillNames: names,
        overwrite: overwrite !== false,
      });
      return { success: true, data };
    } catch (err) {
      console.error('[Skills] add:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:browseRepo', async (event, { repoUrl }) => {
    try {
      validateSender(event, windowManager);
      if (!repoUrl || typeof repoUrl !== 'string') {
        return { success: false, error: 'Invalid URL' };
      }
      const { skills } = await skillInstall.discoverSkillsInRepo(repoUrl.trim());
      const data = skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        skillUrl: s.skillUrl,
      }));
      return { success: true, data };
    } catch (err) {
      console.error('[Skills] browseRepo:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:remove', async (event, { skillId }) => {
    try {
      validateSender(event, windowManager);
      if (!skillId || typeof skillId !== 'string') {
        return { success: false, error: 'Invalid skill id' };
      }
      skillInstall.removeSkill(skillId);
      return { success: true };
    } catch (err) {
      console.error('[Skills] remove:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:readFile', async (event, { skillId, path: relativePath }) => {
    try {
      validateSender(event, windowManager);
      if (!skillId || typeof skillId !== 'string') {
        return { success: false, error: 'Invalid skill id' };
      }
      if (!relativePath || typeof relativePath !== 'string') {
        return { success: false, error: 'Invalid path' };
      }
      const content = skillInstall.readSkillFile(skillId, relativePath);
      return { success: true, data: { skillId, path: relativePath, content } };
    } catch (err) {
      console.error('[Skills] readFile:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
