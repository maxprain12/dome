/* eslint-disable no-console */

const runEngine = require('../run-engine.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('runs:get', (event, runId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.getRun(runId) };
    } catch (error) {
      console.error('[Runs] get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:list', (event, filters) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.listRuns(filters || {}) };
    } catch (error) {
      console.error('[Runs] list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:getActiveBySession', (event, sessionId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.getActiveRunBySession(sessionId) };
    } catch (error) {
      console.error('[Runs] getActiveBySession error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:startLangGraph', async (event, params) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: await runEngine.startLangGraphRun(params || {}) };
    } catch (error) {
      console.error('[Runs] startLangGraph error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:startWorkflow', (event, params) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.startWorkflowRun(params || {}) };
    } catch (error) {
      console.error('[Runs] startWorkflow error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runs:resume', (event, { runId, decisions }) => {
    try {
      validateSender(event, windowManager);
      return runEngine.resumeRun(runId, Array.isArray(decisions) ? decisions : []);
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

  ipcMain.handle('runs:delete', (event, runId) => {
    try {
      validateSender(event, windowManager);
      runEngine.deleteRun(runId);
      return { success: true };
    } catch (error) {
      console.error('[Runs] delete error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:get', (event, automationId) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.getAutomation(automationId) };
    } catch (error) {
      console.error('[Automations] get error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:list', (event, filters) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.listAutomations(filters || {}) };
    } catch (error) {
      console.error('[Automations] list error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:upsert', (event, automation) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: runEngine.upsertAutomation(automation || {}) };
    } catch (error) {
      console.error('[Automations] upsert error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automations:delete', (event, automationId) => {
    try {
      validateSender(event, windowManager);
      runEngine.deleteAutomation(automationId);
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
