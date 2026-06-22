/* eslint-disable no-console */

const runEngine = require('../../agents/run-engine.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('runs:get', async (event, runId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.getRun(runId) };
    } catch (error) {
      console.error('[Runs] get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:list', async (event, filters) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.listRuns(filters || {}) };
    } catch (error) {
      console.error('[Runs] list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:getActiveBySession', async (event, sessionId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.getActiveRunBySession(sessionId) };
    } catch (error) {
      console.error('[Runs] getActiveBySession error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:start', async (event, params) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.startAgentRun(params || {}) };
    } catch (error) {
      console.error('[Runs] start error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:startWorkflow', async (event, params) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.startWorkflowRun(params || {}) };
    } catch (error) {
      console.error('[Runs] startWorkflow error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:resume', async (event, { runId, decisions }) => {
    try {
      validateSender(event, windowManager);
      return await runEngine.resumeRun(runId, Array.isArray(decisions) ? decisions : []);
    } catch (error) {
      console.error('[Runs] resume error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:abort', (event, runId) => {
    try {
      validateSender(event, windowManager);
      runEngine.abortRun(runId);
      return { success: true };
    } catch (error) {
      console.error('[Runs] abort error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:delete', async (event, runId) => {
    try {
      validateSender(event, windowManager);
      await runEngine.deleteRun(runId);
      return { success: true };
    } catch (error) {
      console.error('[Runs] delete error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:get', async (event, automationId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.getAutomation(automationId) };
    } catch (error) {
      console.error('[Automations] get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:list', async (event, filters) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.listAutomations(filters || {}) };
    } catch (error) {
      console.error('[Automations] list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:upsert', async (event, automation) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.upsertAutomation(automation || {}) };
    } catch (error) {
      console.error('[Automations] upsert error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:delete', async (event, automationId) => {
    try {
      validateSender(event, windowManager);
      await runEngine.deleteAutomation(automationId);
      return { success: true };
    } catch (error) {
      console.error('[Automations] delete error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:runNow', async (event, automationId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.startAutomationNow(automationId) };
    } catch (error) {
      console.error('[Automations] runNow error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:notifyContext', async (event, payload) => {
    try {
      validateSender(event, windowManager);
      const tag = payload && typeof payload.tag === 'string' ? payload.tag : '';
      return { success: true, data: await runEngine.fireContextualAutomations(tag) };
    } catch (error) {
      console.error('[Automations] notifyContext error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
