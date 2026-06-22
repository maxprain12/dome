'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { z } = require('zod');

const FeederIdSchema = z.string().min(1);
const FeederCreateSchema = z.record(z.unknown()).optional();
const FeederUpdateScriptSchema = z.object({
  feederId: FeederIdSchema,
  script: z.string().optional(),
});
const FeederRunSchema = z.object({
  feederId: FeederIdSchema,
  triggeredBy: z.string().optional(),
});
const FeederHistorySchema = z.object({
  feederId: FeederIdSchema,
  limit: z.number().int().positive().optional(),
});
const FeederSecretSetSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});
const FeederRequestSecretSchema = z.object({
  name: z.string().min(1),
  feederId: z.string().optional().nullable(),
});

const { createFeederVault } = require('../../services/feeder-vault.cjs');
const {
  runFeeder,
  createFeederRecord,
  updateFeederScript,
  approveFeeder,
} = require('../../services/feeder-runner.cjs');
const { serializeFeederRow, serializeFeederRunRow } = require('../../services/feeder-serialize.cjs');

function register({ ipcMain, windowManager, database }) {
  const vault = createFeederVault(database);

  ipcMain.handle('feeders:create', async (event, input) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    try {
      const feeder = await createFeederRecord(database, parsed.data || {});
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:created', feeder);
      }
      return { success: true, data: feeder };
    } catch (error) {
      console.error('[Feeders] create error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:get', async (event, feederId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederIdSchema.safeParse(feederId);
    if (!parsed.success) {
      return { success: false, error: 'Invalid feederId' };
    }
    try {
      const row = await database.getQueries().getFeederById.get(parsed.data);
      if (!row) return { success: false, error: 'Feeder not found' };
      return { success: true, data: serializeFeederRow(row) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:list', async (event, artifactResourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederIdSchema.safeParse(artifactResourceId);
    if (!parsed.success) {
      return { success: false, error: 'Invalid artifactResourceId' };
    }
    try {
      const rows = await database.getQueries().listFeedersByArtifact.all(parsed.data);
      return { success: true, data: rows.map(serializeFeederRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:listAll', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const rows = await database.getQueries().listAllFeeders.all();
      return { success: true, data: rows.map(serializeFeederRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:update-script', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederUpdateScriptSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    try {
      const { feederId, script } = parsed.data;
      const feeder = await updateFeederScript(database, feederId, String(script || ''));
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:updated', feeder);
      }
      return { success: true, data: feeder };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:approve', async (event, feederId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederIdSchema.safeParse(feederId);
    if (!parsed.success) {
      return { success: false, error: 'Invalid feederId' };
    }
    try {
      const feeder = await approveFeeder(database, parsed.data);
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
    const parsed = FeederIdSchema.safeParse(feederId);
    if (!parsed.success) {
      return { success: false, error: 'Invalid feederId' };
    }
    try {
      await database.getQueries().deleteFeeder.run(parsed.data);
      const workspaceRoot = path.join(app.getPath('userData'), 'feeders', parsed.data);
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:deleted', { feederId });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:run', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederRunSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    try {
      const { feederId, triggeredBy } = parsed.data;
      const result = await runFeeder(database, windowManager, feederId, {
        triggeredBy: triggeredBy || 'user',
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeders:history', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederHistorySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    try {
      const { feederId, limit } = parsed.data;
      const rows = await database.getQueries().listFeederRuns.all(feederId, Math.min(Number(limit) || 20, 100));
      return { success: true, data: rows.map(serializeFeederRunRow) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:list', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (!vault.isAvailable()) {
        return { success: false, error: 'Secret vault unavailable (OS encryption not available)' };
      }
      return { success: true, data: await vault.listSecrets() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:set', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederSecretSetSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    try {
      const { name, value } = parsed.data;
      const data = await vault.setSecret(name, value);
      if (windowManager.broadcast) {
        windowManager.broadcast('feeder:secret-updated', { name: data.name });
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('feeder-secrets:delete', async (event, secretId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederIdSchema.safeParse(secretId);
    if (!parsed.success) {
      return { success: false, error: 'Invalid secretId' };
    }
    try {
      await vault.deleteSecret(parsed.data);
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

  ipcMain.handle('feeders:request-secret', (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = FeederRequestSecretSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const { name, feederId } = parsed.data;
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
