/* eslint-disable no-console */
const runEngine = require('../run-engine.cjs');
const kbProvision = require('../kb-llm-provision.cjs');
const {
  KB_GLOBAL_KEY,
  projectKey,
  parseJson,
  defaultGlobalConfig,
  effectiveKbEnabled,
} = require('../kb-llm-shared.cjs');

function register({ ipcMain, windowManager, database, validateSender }) {
  const queries = () => database.getQueries();

  ipcMain.handle('kbllm:getGlobal', (event) => {
    try {
      validateSender(event, windowManager);
      const q = queries();
      const merged = { ...defaultGlobalConfig(), ...parseJson(q.getSetting.get(KB_GLOBAL_KEY)?.value, {}) };
      return { success: true, data: merged };
    } catch (error) {
      console.error('[KB LLM] getGlobal', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:setGlobal', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const q = queries();
      const next = { ...defaultGlobalConfig(), ...parseJson(q.getSetting.get(KB_GLOBAL_KEY)?.value, {}), ...(payload || {}) };
      q.setSetting.run(KB_GLOBAL_KEY, JSON.stringify(next), Date.now());
      const sync = kbProvision.syncKbLlmAllProjects(database);
      return { success: true, data: { config: next, sync } };
    } catch (error) {
      console.error('[KB LLM] setGlobal', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:getProjectOverride', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      if (!projectId || typeof projectId !== 'string') {
        return { success: false, error: 'projectId required' };
      }
      const q = queries();
      const merged = { override: 'inherit', ...parseJson(q.getSetting.get(projectKey(projectId))?.value, {}) };
      return { success: true, data: merged };
    } catch (error) {
      console.error('[KB LLM] getProjectOverride', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:setProjectOverride', (event, payload) => {
    try {
      validateSender(event, windowManager);
      const projectId = payload?.projectId;
      if (!projectId || typeof projectId !== 'string') {
        return { success: false, error: 'projectId required' };
      }
      const q = queries();
      const prev = parseJson(q.getSetting.get(projectKey(projectId))?.value, {});
      const next = { ...prev, ...(payload || {}) };
      q.setSetting.run(projectKey(projectId), JSON.stringify(next), Date.now());
      const sync = kbProvision.syncKbLlmForProject(database, projectId);
      return { success: true, data: { override: next, sync } };
    } catch (error) {
      console.error('[KB LLM] setProjectOverride', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:syncProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      if (!projectId || typeof projectId !== 'string') {
        return { success: false, error: 'projectId required' };
      }
      const data = kbProvision.syncKbLlmForProject(database, projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[KB LLM] syncProject', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:syncAll', (event) => {
    try {
      validateSender(event, windowManager);
      const data = kbProvision.syncKbLlmAllProjects(database);
      return { success: true, data };
    } catch (error) {
      console.error('[KB LLM] syncAll', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('kbllm:getStatus', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const q = queries();
      const global = { ...defaultGlobalConfig(), ...parseJson(q.getSetting.get(KB_GLOBAL_KEY)?.value, {}) };
      const pid = typeof projectId === 'string' && projectId ? projectId : 'default';
      const projectOverride = { override: 'inherit', ...parseJson(q.getSetting.get(projectKey(pid))?.value, {}) };
      const effectiveEnabled = effectiveKbEnabled(global, projectOverride);
      const ids = kbProvision.automationIds(pid);
      const compileA = runEngine.getAutomation(ids.compile);
      const healthA = runEngine.getAutomation(ids.health);
      const compileRuns = runEngine.listRuns({ automationId: ids.compile, limit: 1 });
      const healthRuns = runEngine.listRuns({ automationId: ids.health, limit: 1 });
      return {
        success: true,
        data: {
          global,
          projectId: pid,
          projectOverride,
          effectiveEnabled,
          automations: { compile: compileA, health: healthA },
          lastRuns: {
            compile: compileRuns[0] ?? null,
            health: healthRuns[0] ?? null,
          },
        },
      };
    } catch (error) {
      console.error('[KB LLM] getStatus', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
