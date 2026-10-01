/* eslint-disable no-console */
const { shell } = require('electron');
const { z } = require('zod');
const memoryPolicy = require('../../personality/memory-policy.cjs');

function register({ ipcMain, windowManager, personalityLoader, database }) {
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

  ipcMain.handle('personality:memory-policy', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const parsed = z.object({ mode: z.enum(['get', 'set']), conversationId: z.string().min(1).max(200).optional(), enabled: z.boolean().optional() }).parse(params);
      if (parsed.mode === 'set' && parsed.enabled === undefined) throw new Error('enabled is required');
      const data = parsed.mode === 'set' ? memoryPolicy.setMemoryPolicy(parsed, database.getQueries()) : memoryPolicy.getMemoryPolicy(parsed, database.getQueries());
      return { success: true, data };
    } catch (error) { return { success: false, error: error.message }; }
  });
  ipcMain.handle('personality:read-document', (event, filename) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      z.string().parse(filename);
      if (!/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(filename)) assertAllowedFilename(filename);
      return { success: true, data: personalityLoader.readContextDocument(filename) };
    } catch (error) { return { success: false, error: error.message }; }
  });

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
        conversationId: params?.conversationId,
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

  ipcMain.handle('personality:write-file', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const { filename, content, expectedRevision } = z.object({ filename: z.string(), content: z.string().max(1_000_000), expectedRevision: z.string().optional() }).parse(params);
      assertAllowedFilename(filename);
      return { success: true, ...personalityLoader.writeContextFile(filename, content, expectedRevision) };
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

  ipcMain.handle('personality:remember-fact', (event, { key, value, domain, conversationId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      memoryPolicy.assertMemoryWriteAllowed({ conversationId });
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

  ipcMain.handle('personality:write-daily-memory', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { date, content, expectedRevision } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), content: z.string().max(1_000_000), expectedRevision: z.string().optional() }).parse(params);
      return { success: true, ...personalityLoader.writeDailyMemory(date, content, expectedRevision) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
