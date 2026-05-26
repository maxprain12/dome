'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const { createFeederVault } = require('../services/feeder-vault.cjs');
const {
  runFeeder,
  createFeederRecord,
  updateFeederScript,
  approveFeeder,
} = require('../services/feeder-runner.cjs');
const { serializeFeederRow, serializeFeederRunRow } = require('../services/feeder-serialize.cjs');

function register({ ipcMain, windowManager, database }) {
  const vault = createFeederVault(database);

  ipcMain.handle('feeders:create', (event, input) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const feeder = createFeederRecord(database, input || {});
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:created', feeder);
      }
      return { success: true, data: feeder };
    } catch (error) {
      console.error('[Feeders] create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:get', (event, feederId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const row = database.getQueries().getFeederById.get(feederId);
      if (!row) return { success: false, error: 'Feeder not found' };
      return { success: true, data: serializeFeederRow(row) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:list', (event, artifactResourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const rows = database.getQueries().listFeedersByArtifact.all(artifactResourceId);
      return { success: true, data: rows.map(serializeFeederRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:listAll', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const rows = database.getQueries().listAllFeeders.all();
      return { success: true, data: rows.map(serializeFeederRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:update-script', (event, { feederId, script }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const feeder = updateFeederScript(database, feederId, String(script || ''));
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:updated', feeder);
      }
      return { success: true, data: feeder };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:approve', (event, feederId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const feeder = approveFeeder(database, feederId);
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:updated', feeder);
      }
      return { success: true, data: feeder };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:delete', async (event, feederId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      database.getQueries().deleteFeeder.run(feederId);
      const workspaceRoot = path.join(app.getPath('userData'), 'feeders', feederId);
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:deleted', { feederId });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:run', async (event, { feederId, triggeredBy }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await runFeeder(database, windowManager, feederId, {
        triggeredBy: triggeredBy || 'user',
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:history', (event, { feederId, limit }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const rows = database.getQueries().listFeederRuns.all(feederId, Math.min(Number(limit) || 20, 100));
      return { success: true, data: rows.map(serializeFeederRunRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:list', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (!vault.isAvailable()) {
        return { success: false, error: 'Secret vault unavailable (OS encryption not available)' };
      }
      return { success: true, data: vault.listSecrets() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:set', (event, { name, value }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const data = vault.setSecret(name, value);
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:secret-updated', { name: data.name });
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:delete', (event, secretId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      vault.deleteSecret(secretId);
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:secret-deleted', { secretId });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:vault-status', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    return { success: true, data: { available: vault.isAvailable() } };
  });

  ipcMain.handle('feeders:request-secret', (event, { name, feederId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const secretName = String(name || '').trim();
    if (!secretName) return { success: false, error: 'name is required' };
    if (windowManager.broadcast) {
      windowManager.broadcast('feeder:secret-request', { name: secretName, feederId: feederId || null });
    }
    return {
      success: true,
      message: `Secret request sent to UI for "${secretName}". Ask the user to enter the value in Settings or the Feeders panel.`,
    };
  });
}

module.exports = { register };
