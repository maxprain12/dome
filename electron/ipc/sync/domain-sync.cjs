/* eslint-disable no-console */
/**
 * IPC: Domain Sync v1 (social, pipelines, calendar) — gated by Dome subscription.
 */
'use strict';

const { z } = require('zod');
const domainSync = require('../../storage/domain-sync.cjs');
const planGate = require('../../storage/plan-gate.cjs');
const socialCloudAdapter = require('../../storage/social-cloud-adapter.cjs');
const { getSocialService } = require('../../social/social-service.cjs');

const DomainSchema = z.enum(['social', 'pipelines', 'calendar', 'settings']);
const SetDomainEnabledSchema = z.object({
  domain: DomainSchema,
  enabled: z.boolean(),
});
const SyncNowSchema = z.object({
  domain: DomainSchema.optional(),
});
const CloudPublishingSchema = z.object({
  accountId: z.string().min(1),
  enabled: z.boolean(),
});

function register({ ipcMain, windowManager, database }) {
  const deps = { database, windowManager };

  ipcMain.handle('domainSync:getEntitlements', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await planGate.getEntitlements(database);
      return { success: true, ...result.entitlements, fetchOk: result.ok, fetchError: result.error };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('domainSync:getStatus', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const ent = await planGate.getEntitlements(database);
      const db = database.getDB?.();
      const domains = db ? domainSync.getAllDomainStatus(db) : {};
      return {
        success: true,
        entitlements: ent.entitlements,
        showCloudUi: ent.entitlements.showCloudUi,
        domains,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('domainSync:setDomainEnabled', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = SetDomainEnabledSchema.safeParse(raw ?? {});
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    const { domain, enabled } = parsed.data;
    const gate = await planGate.assertFeature(database, planGate.featureForDomain(domain));
    if (!gate.ok) return { success: false, error: gate.reason, feature: gate.feature };
    const db = database.getDB?.();
    if (!db) return { success: false, error: 'no_database' };
    domainSync.setDomainState(db, domain, { enabled });
    return { success: true, domain, enabled };
  });

  ipcMain.handle('domainSync:syncNow', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = SyncNowSchema.safeParse(raw ?? {});
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    const ent = await planGate.getEntitlements(database);
    if (!ent.entitlements.showCloudUi) {
      return { success: false, error: 'subscription_inactive', gated: true };
    }
    try {
      if (parsed.data.domain) {
        return await domainSync.syncDomain(deps, parsed.data.domain);
      }
      return await domainSync.syncAllEnabledDomains(deps);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('social:setCloudPublishing', async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const parsed = CloudPublishingSchema.safeParse(raw ?? {});
    if (!parsed.success) return { success: false, error: 'Invalid payload' };
    try {
      const service = getSocialService(database, windowManager);
      const result = await socialCloudAdapter.setCloudPublishing(
        deps,
        service.store,
        parsed.data.accountId,
        parsed.data.enabled,
      );
      if (result.success && result.account) {
        windowManager.broadcast?.('social:account-updated', result.account);
      }
      return result;
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

module.exports = { register };
