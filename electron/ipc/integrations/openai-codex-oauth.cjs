'use strict';

/* eslint-disable no-console */

const { z } = require('zod');
const { shell } = require('electron');
const openaiCodexOAuth = require('../../auth/openai-codex-oauth.cjs');

/** These channels take no payload from the renderer. */
const NoPayloadSchema = z.union([z.undefined(), z.null()]).optional();

/**
 * IPC handlers for ChatGPT / Codex OAuth (experimental).
 * Channels: openai-codex:auth:login | openai-codex:auth:status | openai-codex:auth:disconnect
 * Event: openai-codex:auth:device-code
 */
function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('openai-codex:auth:login', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
    }
    try {
      await openaiCodexOAuth.login(database, {
        onDeviceCode: (info) => {
          try {
            event.sender.send('openai-codex:auth:device-code', info);
          } catch {
            /* sender gone */
          }
          if (typeof info.verificationUri === 'string' && info.verificationUri) {
            void shell.openExternal(info.verificationUri).catch(() => {});
          }
        },
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('openai-codex:auth:status', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
    }
    try {
      return { success: true, ...openaiCodexOAuth.getStatus(database) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('openai-codex:auth:disconnect', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!NoPayloadSchema.safeParse(payload).success) {
      return { success: false, error: 'Invalid arguments' };
    }
    try {
      return openaiCodexOAuth.disconnect(database);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register };
