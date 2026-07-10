'use strict';

/**
 * Domain Sync v1 — desktop client engine (push/pull per domain).
 * Contract: dome-meta/knowledge/contracts/domain-sync-v1.md
 */
/* eslint-disable no-console */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const { getOrCreateDeviceId } = require('./cloud-sync-service.cjs');
const syncTombstone = require('./sync-tombstone.cjs');
const planGate = require('./plan-gate.cjs');

const settingsSyncBridge = require('./settings-sync-bridge.cjs');

const DOMAIN_PULL_LIMIT = 500;
const VALID_DOMAINS = /** @type {const} */ (['social', 'pipelines', 'calendar', 'settings']);

/** @typedef {'social' | 'pipelines' | 'calendar' | 'settings'} DomainName */

/**
 * @typedef {object} TableSpec
 * @property {string} name
 * @property {string} deltaColumn
 * @property {boolean} [appendOnly]
 * @property {string[]} [excludePush]
 */

/**
 * @type {Record<DomainName, { tables: TableSpec[] }>}
 */
const DOMAIN_SPECS = {
  social: {
    tables: [
      { name: 'social_accounts', deltaColumn: 'updated_at', excludePush: ['credentials'] },
      { name: 'social_posts', deltaColumn: 'updated_at' },
      { name: 'social_metrics', deltaColumn: 'updated_at' },
      { name: 'social_account_metrics', deltaColumn: 'updated_at' },
    ],
  },
  pipelines: {
    tables: [
      { name: 'pipelines', deltaColumn: 'updated_at' },
      { name: 'pipeline_stages', deltaColumn: 'updated_at' },
      { name: 'pipeline_sources', deltaColumn: 'updated_at' },
      { name: 'pipeline_items', deltaColumn: 'updated_at' },
      { name: 'pipeline_item_events', deltaColumn: 'created_at', appendOnly: true },
    ],
  },
  calendar: {
    tables: [
      { name: 'calendar_events', deltaColumn: 'updated_at' },
      { name: 'calendar_event_links', deltaColumn: 'updated_at' },
    ],
  },
  settings: {
    tables: [{ name: 'synced_settings', deltaColumn: 'updated_at' }],
  },
};

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 */
function ensureDomainStateRow(db, domain) {
  const now = Date.now();
  db.prepare(
    `
      INSERT INTO domain_sync_state (domain, last_pull_cursor, last_push_at, enabled, updated_at)
      VALUES (?, '0', 0, 1, ?)
      ON CONFLICT(domain) DO NOTHING
    `,
  ).run(domain, now);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 */
function getDomainState(db, domain) {
  ensureDomainStateRow(db, domain);
  const row = db.prepare('SELECT * FROM domain_sync_state WHERE domain = ?').get(domain);
  return {
    lastPullCursor: row?.last_pull_cursor ?? '0',
    lastPushAt: row?.last_push_at ?? 0,
    enabled: row?.enabled !== 0,
    updatedAt: row?.updated_at ?? 0,
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {Partial<{ lastPullCursor: string, lastPushAt: number, enabled: boolean }>} patch
 */
function setDomainState(db, domain, patch) {
  ensureDomainStateRow(db, domain);
  const current = getDomainState(db, domain);
  const next = {
    lastPullCursor: patch.lastPullCursor ?? current.lastPullCursor,
    lastPushAt: patch.lastPushAt ?? current.lastPushAt,
    enabled: patch.enabled ?? current.enabled,
  };
  db.prepare(
    `
      UPDATE domain_sync_state
      SET last_pull_cursor = ?, last_push_at = ?, enabled = ?, updated_at = ?
      WHERE domain = ?
    `,
  ).run(
    next.lastPullCursor,
    next.lastPushAt,
    next.enabled ? 1 : 0,
    Date.now(),
    domain,
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 */
function pragmaColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} [exclude]
 */
function sanitizeRowForWire(row, exclude = []) {
  const skip = new Set([...exclude, 'user_id', 'deleted_at']);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    if (k === 'cloud_publishing') {
      out[k] = v === 1 || v === true;
      continue;
    }
    out[k] = v;
  }
  const revision = Number(out.updated_at ?? row.updated_at ?? row.captured_at ?? row.created_at ?? row.connected_at);
  if (Number.isFinite(revision) && revision > 0) {
    out.updated_at = revision;
  }
  return out;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {number} sinceMs
 */
function buildPushRows(db, domain, sinceMs) {
  const spec = DOMAIN_SPECS[domain];
  /** @type {Record<string, Record<string, unknown>[]>} */
  const rows = {};
  for (const table of spec.tables) {
    const cols = pragmaColumns(db, table.name);
    if (!cols.has('id')) continue;
    const deltaCol = table.deltaColumn;
    if (!cols.has(deltaCol)) continue;

    let sql;
    if (table.appendOnly) {
      sql = sinceMs > 0
        ? `SELECT * FROM ${table.name} WHERE ${deltaCol} > ?`
        : `SELECT * FROM ${table.name}`;
    } else {
      sql = sinceMs > 0
        ? `SELECT * FROM ${table.name} WHERE ${deltaCol} > ?`
        : `SELECT * FROM ${table.name}`;
    }
    const raw = sinceMs > 0 ? db.prepare(sql).all(sinceMs) : db.prepare(sql).all();
    rows[table.name] = raw.map((r) => sanitizeRowForWire(r, table.excludePush));
  }
  return rows;
}

/**
 * @param {Record<string, unknown> | undefined} localRow
 * @param {Record<string, unknown>} remoteRow
 * @param {string} localDeviceId
 */
function shouldApplyRemoteRow(localRow, remoteRow, localDeviceId) {
  if (remoteRow.device_id === localDeviceId) return false;
  if (!localRow) return true;
  const localUpdated = Number(localRow.updated_at ?? localRow.created_at ?? 0);
  const remoteUpdated = Number(remoteRow.updated_at ?? remoteRow.created_at ?? 0);
  if (remoteUpdated > localUpdated) return true;
  if (remoteUpdated < localUpdated) return false;
  const localDev = String(localRow.device_id ?? '');
  const remoteDev = String(remoteRow.device_id ?? '');
  return remoteDev.localeCompare(localDev) > 0;
}

/**
 * Companion-created calendar events don't satisfy the local schema as-is:
 * `calendar_id` is NOT NULL (FK a calendar_calendars) and `source` has a
 * CHECK('local','google','manual'). Adopt them into the seeded local calendar.
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {Record<string, unknown>} filtered
 */
function normalizeCalendarEventRow(db, table, filtered) {
  if (table !== 'calendar_events') return filtered;
  if (!filtered.calendar_id) {
    const hasLocal = db
      .prepare("SELECT id FROM calendar_calendars WHERE id = 'local-default'")
      .get();
    if (!hasLocal) return null; // can't satisfy the FK yet — skip this row
    filtered.calendar_id = 'local-default';
  }
  if (!['local', 'google', 'manual'].includes(String(filtered.source ?? ''))) {
    filtered.source = 'manual';
  }
  return filtered;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {Record<string, unknown>} row
 * @param {boolean} [appendOnly]
 */
function applyLocalRow(db, table, row, appendOnly = false) {
  const validCols = pragmaColumns(db, table);
  /** @type {Record<string, unknown>} */
  let filtered = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'device_id' || k === 'deleted_at' || k === 'user_id') continue;
    if (!validCols.has(k)) continue;
    if (k === 'cloud_publishing') {
      filtered[k] = v === true || v === 1 ? 1 : 0;
      continue;
    }
    filtered[k] = v;
  }
  filtered = normalizeCalendarEventRow(db, table, filtered);
  if (!filtered) return;
  const keys = Object.keys(filtered);
  if (keys.length === 0) return;

  if (appendOnly) {
    const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(filtered.id);
    if (existing) return;
  }

  const placeholders = keys.map(() => '?').join(',');
  const sql = appendOnly
    ? `INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`
    : `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...keys.map((k) => filtered[k]));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {object} data
 * @param {string} localDeviceId
 */
function applyPullPayload(db, domain, data, localDeviceId) {
  const spec = DOMAIN_SPECS[domain];
  const tombstones = data.tombstones || [];

  for (const t of tombstones) {
    if (!t?.table || !t?.id) continue;
    syncTombstone.applyRemoteTombstone(db, t.table, t.id);
  }

  const rowsByTable = data.rows || {};
  for (const tableSpec of spec.tables) {
    const remoteRows = rowsByTable[tableSpec.name];
    if (!Array.isArray(remoteRows) || remoteRows.length === 0) continue;
    const getLocal = db.prepare(`SELECT * FROM ${tableSpec.name} WHERE id = ?`);
    for (const remoteRow of remoteRows) {
      if (!remoteRow?.id) continue;
      const localRow = getLocal.get(remoteRow.id);
      if (!shouldApplyRemoteRow(localRow, remoteRow, localDeviceId)) continue;
      applyLocalRow(db, tableSpec.name, remoteRow, tableSpec.appendOnly === true);
    }
  }
}

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {DomainName} domain
 */
async function pullDomain(deps, domain) {
  if (!VALID_DOMAINS.includes(domain)) {
    return { success: false, error: `unknown_domain:${domain}` };
  }
  const feature = planGate.featureForDomain(domain);
  const gate = await planGate.assertFeature(deps.database, feature);
  if (!gate.ok) {
    return { success: false, error: gate.reason, feature: gate.feature ?? feature, gated: true };
  }
  const db = deps.database.getDB?.();
  if (!db) return { success: false, error: 'no_database' };

  const state = getDomainState(db, domain);
  if (!state.enabled) return { success: true, skipped: true, reason: 'disabled' };

  const localDeviceId = getOrCreateDeviceId(db);
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  let cursor = state.lastPullCursor || '0';
  let pages = 0;
  let applied = 0;

  for (;;) {
    const url = `${base}/api/v1/data/${domain}/pull?since=${encodeURIComponent(cursor)}&limit=${DOMAIN_PULL_LIMIT}`;
    const res = await domeOauth.fetchWithDomeAuth(deps.database, url, { method: 'GET' });
    if (!res.ok) {
      const t = await res.text();
      return { success: false, error: `${res.status} ${t}` };
    }
    const data = await res.json();
    applyPullPayload(db, domain, data, localDeviceId);
    const rowCount = Object.values(data.rows || {}).reduce(
      (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
    applied += rowCount + (data.tombstones?.length || 0);
    cursor = data.nextSince ?? cursor;
    pages += 1;
    if (!data.hasMore) break;
    if (pages > 50) {
      console.warn('[domain-sync] pull pagination safety stop', domain);
      break;
    }
  }

  setDomainState(db, domain, { lastPullCursor: cursor });
  if (domain === 'social' && applied > 0) {
    deps.windowManager?.broadcast?.('social:posts-refresh', {});
  }
  if (domain === 'calendar' && applied > 0) {
    adoptOrphanCalendarEvents(db, deps.windowManager);
  }
  if (domain === 'settings' && applied > 0) {
    settingsSyncBridge.applySyncedSettingsToLocal(db, deps.windowManager);
  }
  return { success: true, applied, nextSince: cursor };
}

/**
 * Companion-created events arrive without `calendar_id` (contract §3.3): the
 * desktop adopts them into the seeded local calendar so range queries (which
 * JOIN calendar_calendars) can see them.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [windowManager]
 */
function adoptOrphanCalendarEvents(db, windowManager) {
  const orphans = db
    .prepare("SELECT id FROM calendar_events WHERE calendar_id IS NULL OR calendar_id = ''")
    .all();
  if (orphans.length === 0) return;
  const hasLocal = db
    .prepare("SELECT id FROM calendar_calendars WHERE id = 'local-default'")
    .get();
  if (!hasLocal) return;
  db.prepare(
    "UPDATE calendar_events SET calendar_id = 'local-default' WHERE calendar_id IS NULL OR calendar_id = ''",
  ).run();
  windowManager?.broadcast?.('calendar:eventCreated', { adopted: orphans.length });
}

/**
 * Metrics inserts historically omitted updated_at; backfill before push so the
 * provider structural validator accepts the batch.
 * @param {import('better-sqlite3').Database} db
 */
function backfillSocialMetricsUpdatedAt(db) {
  db.exec(`
    UPDATE social_metrics
    SET updated_at = captured_at
    WHERE updated_at IS NULL OR updated_at = 0
  `);
  db.exec(`
    UPDATE social_account_metrics
    SET updated_at = captured_at
    WHERE updated_at IS NULL OR updated_at = 0
  `);
}

/**
 * @param {Array<{ table: string, id: string, deletedAt: number }>} [tombstones]
 */
async function pushDomainRows(deps, domain, rows, tombstones = []) {
  const feature = planGate.featureForDomain(domain);
  const gate = await planGate.assertFeature(deps.database, feature);
  if (!gate.ok) {
    return { success: false, error: gate.reason, feature: gate.feature ?? feature, gated: true };
  }
  const db = deps.database.getDB?.();
  if (!db) return { success: false, error: 'no_database' };

  const state = getDomainState(db, domain);
  const deviceId = getOrCreateDeviceId(db);
  const pushStartedAt = Date.now();
  const body = JSON.stringify({ deviceId, rows, tombstones });
  const url = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/data/${domain}/push`;
  const res = await domeOauth.fetchWithDomeAuth(deps.database, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: `${res.status} ${t}` };
  }

  const data = await res.json();
  if (tombstones.length) {
    syncTombstone.markTombstonesSynced(db, tombstones);
  }
  setDomainState(db, domain, {
    lastPushAt: pushStartedAt,
    lastPullCursor: data.nextSince ?? state.lastPullCursor,
  });
  return {
    success: true,
    applied: data.applied ?? 0,
    skipped: data.skipped?.length ?? 0,
    rejected: data.rejected?.length ?? 0,
    skippedDetails: data.skipped,
    rejectedDetails: data.rejected,
  };
}

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {DomainName} domain
 */
async function pushDomain(deps, domain) {
  if (!VALID_DOMAINS.includes(domain)) {
    return { success: false, error: `unknown_domain:${domain}` };
  }
  const db = deps.database.getDB?.();
  if (!db) return { success: false, error: 'no_database' };

  const state = getDomainState(db, domain);
  if (!state.enabled) return { success: true, skipped: true, reason: 'disabled' };

  backfillSocialMetricsUpdatedAt(db);
  const rows = buildPushRows(db, domain, state.lastPushAt);
  const tombstones = syncTombstone.getPendingTombstones(db, domain);
  return pushDomainRows(deps, domain, rows, tombstones);
}

/**
 * Pull then push one domain. Calendar is bidirectional since Companion can
 * create simple events (contract §3.3 rev. 2026-07-08).
 * @param {object} deps
 * @param {DomainName} domain
 */
async function syncDomain(deps, domain) {
  const pulled = await pullDomain(deps, domain);
  if (!pulled.success) return pulled;
  return pushDomain(deps, domain);
}

/**
 * Sync all enabled domains sequentially.
 * @param {object} deps
 * @param {object} [deps.windowManager]
 */
async function syncAllEnabledDomains(deps) {
  const db = deps.database.getDB?.();
  if (!db) return { success: false, error: 'no_database' };

  const ent = await planGate.getEntitlements(deps.database);
  if (!ent.entitlements.showCloudUi) {
    return { success: true, skipped: true, reason: 'subscription_or_feature_required' };
  }

  /** @type {Record<string, unknown>} */
  const results = {};
  for (const domain of VALID_DOMAINS) {
    const feature = planGate.featureForDomain(domain);
    if (!ent.entitlements.features.includes(feature)) {
      results[domain] = { skipped: true, reason: 'feature_not_in_plan' };
      continue;
    }
    const state = getDomainState(db, domain);
    if (!state.enabled) {
      results[domain] = { skipped: true, reason: 'disabled' };
      continue;
    }
    try {
      results[domain] = await syncDomain(deps, domain);
      deps.windowManager?.broadcast?.('domain-sync:completed', { domain, ...results[domain] });
    } catch (err) {
      results[domain] = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { success: true, results };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getAllDomainStatus(db) {
  /** @type {Record<string, ReturnType<typeof getDomainState>>} */
  const out = {};
  for (const domain of VALID_DOMAINS) {
    out[domain] = getDomainState(db, domain);
  }
  return out;
}

module.exports = {
  VALID_DOMAINS,
  DOMAIN_SPECS,
  getDomainState,
  setDomainState,
  getAllDomainStatus,
  pullDomain,
  pushDomain,
  pushDomainRows,
  syncDomain,
  syncAllEnabledDomains,
  buildPushRows,
  sanitizeRowForWire,
  applyPullPayload,
};
