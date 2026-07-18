'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const claudeOAuth = require('../../auth/claude-oauth.cjs');

/** These channels take no payload from the renderer. */
const NoPayloadSchema = z.union([z.undefined(), z.null()]).optional();

/**
 * IPC handlers for Claude Pro/Max OAuth (experimental).
 * Channels: claude:auth:login | claude:auth:status | claude:auth:disconnect
 */
function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('claude:auth:login', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
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

  ipcMain.handle('claude:auth:status', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
    }
    try {
      return { success: true, ...claudeOAuth.getStatus(database) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('claude:auth:disconnect', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
    }
    try {
      return claudeOAuth.disconnect(database);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register };
