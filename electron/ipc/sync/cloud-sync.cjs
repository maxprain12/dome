/* eslint-disable no-console */
/**
 * IPC: Dome cloud sync (Provider + Supabase via REST).
 */
'use strict';

const { z } = require('zod');
const cloudSyncService = require('../../storage/cloud-sync-service.cjs');
const planGate = require('../../storage/plan-gate.cjs');

const CloudSyncSetSettingsSchema = z
  .object({
    auto_enabled: z.boolean().optional(),
    interval_minutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
  })
  .strict();

let revisionWatchTimer = null;
let lastKnownRemoteRevision = null;

function register({ ipcMain, windowManager, database, fileStorage }) {
  ipcMain.handle('cloudSync:getStatus', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const db = database.getDB?.();
      const localRevision = db ? cloudSyncService.getLocalRevision(db) : 0;
      const remote = await cloudSyncService.getRemoteStatus(database);
      if (!remote.success) {
        return { success: true, connected: false, localRevision, error: remote.error };
      }
      return {
        success: true,
        connected: true,
        localRevision,
        currentRevision: remote.currentRevision,
        syncSchemaVersion: remote.syncSchemaVersion,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cloudSync:push', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const gate = await planGate.assertFeature(database, 'cloud_sync');
    if (!gate.ok) return { success: false, error: gate.reason, gated: true };
    try {
      return await cloudSyncService.pushFullSync({ database, fileStorage, windowManager });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cloudSync:pull', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const gate = await planGate.assertFeature(database, 'cloud_sync');
    if (!gate.ok) return { success: false, error: gate.reason, gated: true };
    try {
      return await cloudSyncService.pullAndApply({ database, fileStorage, windowManager });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cloudSync:startRevisionWatcher', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (revisionWatchTimer) clearInterval(revisionWatchTimer);
    revisionWatchTimer = setInterval(async () => {
      try {
        const st = await cloudSyncService.getRemoteStatus(database);
        if (!st.success || st.currentRevision === undefined) return;
        if (lastKnownRemoteRevision === null) {
          lastKnownRemoteRevision = st.currentRevision;
          return;
        }
        if (st.currentRevision !== lastKnownRemoteRevision) {
          lastKnownRemoteRevision = st.currentRevision;
          windowManager.broadcast('cloud-sync:revision', { revision: st.currentRevision });
        }
      } catch (err) {
        console.warn('[cloudSync] watcher', err?.message || err);
      }
    }, 30_000);
    return { success: true };
  });

  ipcMain.handle('cloudSync:stopRevisionWatcher', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (revisionWatchTimer) {
      clearInterval(revisionWatchTimer);
      revisionWatchTimer = null;
    }
    lastKnownRemoteRevision = null;
    return { success: true };
  });

  ipcMain.handle('cloudSync:getSettings', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const q = database.getQueries();
      const get = (key, def) => q.getSetting?.get?.(key)?.value ?? def;
      return {
        success: true,
        settings: {
          auto_enabled: get('dome_sync_auto_enabled', 'false') === 'true',
          interval_minutes: Math.max(5, parseInt(get('dome_sync_interval_minutes', '15'), 10) || 15),
        },
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('cloudSync:setSettings', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = CloudSyncSetSettingsSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const partial = parsed.data;
    try {
      const q = database.getQueries();
      const now = Date.now();
      if (partial.auto_enabled != null) {
        q.setSetting.run('dome_sync_auto_enabled', partial.auto_enabled ? 'true' : 'false', now);
      }
      if (partial.interval_minutes != null) {
        const m = Math.min(24 * 60, Math.max(5, Number(partial.interval_minutes) || 15));
        q.setSetting.run('dome_sync_interval_minutes', String(m), now);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

function disposeCloudSync() {
  if (revisionWatchTimer) {
    clearInterval(revisionWatchTimer);
    revisionWatchTimer = null;
  }
  lastKnownRemoteRevision = null;
}

module.exports = { register, disposeCloudSync };
