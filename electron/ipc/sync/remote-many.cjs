'use strict';

const { z } = require('zod');
const remote = require('../../remote/index.cjs');

const EmptySchema = z.union([z.undefined(), z.null(), z.object({}).passthrough()]);
const EnabledSchema = z.object({ enabled: z.boolean() });
const RevokeSchema = z.object({ deviceId: z.string().min(1) });

function unauthorized() {
  return { success: false, error: 'Unauthorized' };
}

function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);

  ipcMain.handle('remote-many:status', (event) => {
    if (!guard(event)) return unauthorized();
    EmptySchema.parse(undefined);
    return { success: true, data: remote.getRuntime()?.getStatus() || { enabled: false, connected: false } };
  });

  ipcMain.handle('remote-many:set-enabled', async (event, payload) => {
    if (!guard(event)) return unauthorized();
    const parsed = EnabledSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    const runtime = remote.getRuntime();
    if (!runtime) return { success: false, error: 'Remote Many is not running' };
    return { success: true, data: await runtime.setEnabled(parsed.data.enabled) };
  });

  ipcMain.handle('remote-many:pair-start', async (event) => {
    if (!guard(event)) return unauthorized();
    const runtime = remote.getRuntime();
    if (!runtime) return { success: false, error: 'Remote Many is not running' };
    try {
      return { success: true, data: await runtime.startPairing() };
    } catch (err) {
      return { success: false, error: err?.message || 'pairing_failed' };
    }
  });

  ipcMain.handle('remote-many:pair-cancel', (event) => {
    if (!guard(event)) return unauthorized();
    const runtime = remote.getRuntime();
    if (!runtime) return { success: false, error: 'Remote Many is not running' };
    return { success: true, data: runtime.cancelPairing() };
  });

  ipcMain.handle('remote-many:revoke', async (event, payload) => {
    if (!guard(event)) return unauthorized();
    const parsed = RevokeSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    const runtime = remote.getRuntime();
    if (!runtime) return { success: false, error: 'Remote Many is not running' };
    try {
      return { success: true, data: await runtime.revoke(parsed.data.deviceId) };
    } catch (err) {
      return { success: false, error: err?.message || 'revoke_failed' };
    }
  });

  ipcMain.handle('remote-many:presence', async (event) => {
    if (!guard(event)) return unauthorized();
    const runtime = remote.getRuntime();
    if (!runtime) return { success: false, error: 'Remote Many is not running' };
    try {
      return { success: true, data: await runtime.presence() };
    } catch (err) {
      return { success: false, error: err?.message || 'presence_failed' };
    }
  });
}

module.exports = { register };
