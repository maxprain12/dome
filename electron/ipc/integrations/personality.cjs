/* eslint-disable no-console */
const { shell } = require('electron');

function register({ ipcMain, windowManager, personalityLoader }) {
  const ALLOWED_CONTEXT_FILES = new Set([
    'SOUL.md',
    'USER.md',
    'MEMORY.md',
    'domains/social.md',
    'domains/email.md',
  ]);

  function assertAllowedFilename(filename) {
    if (typeof filename !== 'string' || !ALLOWED_CONTEXT_FILES.has(filename)) {
      throw new Error('Invalid context filename');
    }
  }

  ipcMain.handle('personality:get-context-files', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const contextFiles = require('../../personality/context-files.cjs');
      return { success: true, data: contextFiles.loadContextFiles() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:get-agent-memory-context', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const contextFiles = require('../../personality/context-files.cjs');
      const data = contextFiles.loadAgentMemoryContext({
        memoryEnabled: params?.memoryEnabled !== false,
        projectId: params?.projectId ?? null,
        projectPath: params?.projectPath ?? null,
        includeProject: params?.includeProject !== false,
        includeDomains: Array.isArray(params?.includeDomains) ? params.includeDomains : [],
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:get-prompt', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const prompt = personalityLoader.buildSystemPrompt(params || {});
      return { success: true, data: prompt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:read-file', (event, filename) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      assertAllowedFilename(filename);
      const content = personalityLoader.readContextFile(filename);
      return { success: true, data: content };
    } catch (error) {
      console.error('[Personality] read-file error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:write-file', (event, { filename, content }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      assertAllowedFilename(filename);
      personalityLoader.writeContextFile(filename, content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:add-memory', (event, entry) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      personalityLoader.addMemoryEntry(entry);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:list-files', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return { success: true, data: personalityLoader.listContextFiles() };
    } catch (error) {
      console.error('[Personality] list-files error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:remember-fact', (event, { key, value, domain }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const normalizedDomain = String(domain || 'general').toLowerCase();
      if (normalizedDomain === 'social' || normalizedDomain === 'email') {
        personalityLoader.updateDomainMemory(normalizedDomain, key, value);
      } else {
        personalityLoader.updateLongTermMemory(key, value);
      }
      personalityLoader.addMemoryEntry(`**${key}** (${normalizedDomain}): ${value}`);
      return { success: true, domain: normalizedDomain };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:open-folder', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const dir = personalityLoader.getPersonalityDir();
      void shell.openPath(dir);
      return { success: true, data: dir };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:list-daily-memory', (event, days = 14) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const n = Math.min(Math.max(Number(days) || 14, 1), 60);
      return { success: true, data: personalityLoader.getRecentMemory(n) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('personality:write-daily-memory', (event, { date, content }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      personalityLoader.writeDailyMemory(date, content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
