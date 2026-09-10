'use strict';

const { z } = require('zod');
const bridge = require('../../browser-extension/index.cjs');

const EmptySchema = z.union([z.undefined(), z.null(), z.object({}).passthrough()]);
const RevokeSchema = z.object({
  clientId: z.string().min(1),
});

function unauthorized() {
  return { success: false, error: 'Unauthorized' };
}

function register({ ipcMain, windowManager }) {
  const guard = (event) => windowManager.isAuthorized(event.sender.id);

  ipcMain.handle('browser-extension:status', (event) => {
    if (!guard(event)) return unauthorized();
    EmptySchema.parse(undefined);
    const pairing = bridge.getPairing();
    return {
      success: true,
      data: {
        ...bridge.getStatus(),
        pairing: pairing ? pairing.pairingStatus() : { active: false, expiresAt: null },
        clients: pairing ? pairing.listClients() : [],
      },
    };
  });

  ipcMain.handle('browser-extension:pair-start', (event) => {
    if (!guard(event)) return unauthorized();
    const pairing = bridge.getPairing();
    if (!pairing) return { success: false, error: 'Browser extension bridge is not running' };
    return { success: true, data: pairing.startPairing() };
  });

  ipcMain.handle('browser-extension:pair-cancel', (event) => {
    if (!guard(event)) return unauthorized();
    const pairing = bridge.getPairing();
    if (!pairing) return { success: false, error: 'Browser extension bridge is not running' };
    return { success: true, data: pairing.cancelPairing() };
  });

  ipcMain.handle('browser-extension:revoke', (event, payload) => {
    if (!guard(event)) return unauthorized();
    const parsed = RevokeSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    const pairing = bridge.getPairing();
    if (!pairing) return { success: false, error: 'Browser extension bridge is not running' };
    return { success: true, data: pairing.revoke(parsed.data.clientId) };
  });
}

module.exports = { register };
