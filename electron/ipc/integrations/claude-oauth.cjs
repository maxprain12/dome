'use strict';

/* eslint-disable no-console */

const { shell } = require('electron');
const claudeOAuth = require('../../auth/claude-oauth.cjs');

/**
 * IPC handlers for Claude Pro/Max OAuth (experimental).
 * Channels: claude:auth:login | claude:auth:status | claude:auth:disconnect
 */
function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('claude:auth:login', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      await claudeOAuth.login(database, {
        onAuth: ({ url }) => {
          void shell.openExternal(url).catch(() => {});
        },
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('claude:auth:status', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return { success: true, ...claudeOAuth.getStatus(database) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('claude:auth:disconnect', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return claudeOAuth.disconnect(database);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register };
