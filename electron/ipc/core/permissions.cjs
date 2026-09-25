/**
 * OS permissions IPC.
 *
 * permissions:get            — { managedByApp, microphone, screen }
 * permissions:request        — { kind } → { status, openedSettings }
 * permissions:open-settings  — { kind } → opens the matching System Settings pane
 * permissions:relaunch       — restart Dome (macOS applies Screen Recording on relaunch)
 */

const { z } = require('zod');
const { MEDIA_PERMISSION_KINDS, createMediaPermissions } = require('../../permissions/media-permissions.cjs');

const KindPayloadSchema = z.object({ kind: z.enum(MEDIA_PERMISSION_KINDS) });

function register({ ipcMain, windowManager }) {
  const { app, desktopCapturer, shell, systemPreferences } = require('electron');
  const permissions = createMediaPermissions({ systemPreferences, desktopCapturer, shell });

  const guard = (handler) => async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      return { success: true, data: await handler(raw) };
    } catch (err) {
      return { success: false, error: err?.message || 'permission_error' };
    }
  };

  const parseKind = (raw) => {
    const parsed = KindPayloadSchema.safeParse(raw ?? {});
    if (!parsed.success) throw new Error('invalid_permission_kind');
    return parsed.data.kind;
  };

  ipcMain.handle('permissions:get', guard(() => permissions.getStatus()));

  ipcMain.handle('permissions:request', guard((raw) => permissions.request(parseKind(raw))));

  ipcMain.handle('permissions:open-settings', guard(async (raw) => ({
    opened: await permissions.openSystemSettings(parseKind(raw)),
  })));

  ipcMain.handle('permissions:relaunch', guard(() => {
    app.relaunch();
    app.exit(0);
    return { relaunching: true };
  }));
}

module.exports = { register };
