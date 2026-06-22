'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const copilotOAuth = require('../../auth/github-copilot-oauth.cjs');

const PollSchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().int().positive().max(60).optional(),
  expiresIn: z.number().int().positive().max(3600).optional(),
});

/**
 * IPC handlers for the GitHub Copilot OAuth device-code flow.
 * Channels: copilot:auth:start | copilot:auth:poll | copilot:auth:status | copilot:auth:disconnect
 */
function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('copilot:auth:start', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const info = await copilotOAuth.startDeviceFlow();
      void shell.openExternal(info.verificationUri).catch(() => {});
      return { success: true, ...info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('copilot:auth:poll', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = PollSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: 'Invalid poll payload' };
    }
    try {
      return await copilotOAuth.pollForAccessToken(database, parsed.data);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('copilot:auth:status', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return { success: true, ...(await copilotOAuth.getStatus(database)) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('copilot:auth:disconnect', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return copilotOAuth.disconnect(database);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register };
