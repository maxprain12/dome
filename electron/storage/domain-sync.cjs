'use strict';

/**
 * Domain Sync v1 — desktop client engine (push/pull per domain).
 */
/* eslint-disable no-console */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const { getOrCreateDeviceId } = require('./device-id.cjs');
const syncTombstone = require('./sync-tombstone.cjs');
const planGate = require('./plan-gate.cjs');

const settingsSyncBridge = require('./settings-sync-bridge.cjs');

const DOMAIN_PULL_LIMIT = 500;
const PUSH_BATCH_MAX_ROWS = 500;
const PUSH_BATCH_MAX_BYTES = 4.5 * 1024 * 1024; // server rejects >5MB; leave headroom
const PUSH_429_MAX_RETRIES = 3;
const VALID_DOMAINS = /** @type {const} */ ([
  'social',
  'pipelines',
  'calendar',
  'settings',
  'library',
  'agents',
  'learn',
  'files',
  'conversations',
]);

/** @typedef {typeof VALID_DOMAINS[number]} DomainName */

/**
 * @typedef {object} TableSpec
 * @property {string} name          Local SQLite table.
 * @property {string} deltaColumn   Column used for incremental push selection.
 * @property {string} [wire]        Wire key (defaults to `name`) — must match the provider catalog.
 * @property {boolean} [appendOnly]
 * @property {string[]} [excludePush]  Local-only columns that must never travel.
 * @property {string} [selectSql]   Custom SELECT producing wire-shaped rows (must expose `id`).
 *                                  Appended with a `WHERE deltaColumn > ?` guard by the engine.
 * @property {(db: import('better-sqlite3').Database, row: Record<string, unknown>) => void} [applyRow]
 *                                  Custom local apply (for tables whose local shape differs from the wire).
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
    // Wire key is `settings` (provider catalog); the local mirror table is synced_settings.
    tables: [{ name: 'synced_settings', wire: 'settings', deltaColumn: 'updated_at' }],
  },
  library: {
    tables: [
      // vault_root is a local filesystem path — never on the wire.
      { name: 'projects', deltaColumn: 'updated_at', excludePush: ['vault_root'] },
      {
        name: 'resources',
        deltaColumn: 'updated_at',
        // Local paths and derived text/thumbnails never travel; they are
        // regenerated (or rehydrated via the files domain) on the other side.
        excludePush: ['file_path', 'internal_path', 'thumbnail_data', 'content_text'],
      },
      { name: 'sources', deltaColumn: 'updated_at' },
      { name: 'tags', deltaColumn: 'updated_at' },
      {
        // Composite local PK — the wire id is '<resource_id>:<tag_id>'.
        name: 'resource_tags',
        deltaColumn: 'updated_at',
        selectSql:
          "SELECT resource_id || ':' || tag_id AS id, resource_id, tag_id, created_at, updated_at FROM resource_tags",
        applyRow: (db, row) => {
          if (!row.resource_id || !row.tag_id) return;
          db.prepare(
            `INSERT OR REPLACE INTO resource_tags (resource_id, tag_id, created_at, updated_at)
             VALUES (?, ?, ?, ?)`,
          ).run(row.resource_id, row.tag_id, row.created_at ?? Date.now(), row.updated_at ?? Date.now());
        },
      },
      { name: 'artifacts', deltaColumn: 'updated_at' },
      { name: 'resource_interactions', deltaColumn: 'updated_at' },
    ],
  },
  agents: {
    tables: [
      { name: 'agent_folders', deltaColumn: 'updated_at' },
      { name: 'workflow_folders', deltaColumn: 'updated_at' },
      { name: 'many_agents', deltaColumn: 'updated_at' },
      { name: 'many_agent_versions', deltaColumn: 'created_at', appendOnly: true },
      { name: 'canvas_workflows', deltaColumn: 'updated_at' },
      { name: 'automation_definitions', deltaColumn: 'updated_at', excludePush: ['legacy_source'] },
    ],
  },
  learn: {
    tables: [
      { name: 'flashcard_decks', deltaColumn: 'updated_at', excludePush: ['studio_output_id'] },
      { name: 'flashcards', deltaColumn: 'updated_at' },
      { name: 'flashcard_sessions', deltaColumn: 'started_at', appendOnly: true },
      { name: 'study_events', deltaColumn: 'started_at', appendOnly: true },
      { name: 'studio_outputs', deltaColumn: 'updated_at', excludePush: ['file_path'] },
      { name: 'quiz_runs', deltaColumn: 'completed_at', appendOnly: true },
    ],
  },
  files: {
    tables: [{ name: 'vault_blobs', wire: 'file_blobs', deltaColumn: 'updated_at', excludePush: ['upload_state', 'local_state'] }],
  },
  conversations: {
    tables: [
      { name: 'chat_sessions', deltaColumn: 'updated_at' },
      { name: 'chat_messages', deltaColumn: 'created_at', appendOnly: true },
      { name: 'many_session_index', wire: 'many_sessions', deltaColumn: 'updated_at' },
    ],
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
 * Booleans stored as INTEGER 0/1 locally but declared `boolean` in the
 * provider catalog — must travel as real booleans or the structural
 * validator rejects the row (`invalid_type`).
 */
const BOOLEAN_WIRE_COLUMNS = new Set([
  'cloud_publishing',
  'archived',
  'is_terminal',
  'enabled',
  'all_day',
  'favorite',
]);

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} [exclude]
 * @param {string} [deltaColumn] Fallback source for the wire `updated_at`.
 */
function sanitizeRowForWire(row, exclude = [], deltaColumn = 'updated_at') {
  // device_id is server-assigned from the push envelope's deviceId — a row
  // carrying it fails the provider's structural validation (unknown_column).
  const skip = new Set([...exclude, 'user_id', 'deleted_at', 'device_id']);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    if (BOOLEAN_WIRE_COLUMNS.has(k)) {
      out[k] = v === 1 || v === true;
      continue;
    }
    out[k] = v;
  }
  const revision = Number(
    out.updated_at ??
      row.updated_at ??
      row[deltaColumn] ??
      row.captured_at ??
      row.created_at ??
      row.connected_at,
  );
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
    const deltaCol = table.deltaColumn;
    let raw;
    if (table.selectSql) {
      const sql = sinceMs > 0 ? `${table.selectSql} WHERE ${deltaCol} > ?` : table.selectSql;
      raw = sinceMs > 0 ? db.prepare(sql).all(sinceMs) : db.prepare(sql).all();
    } else {
      const cols = pragmaColumns(db, table.name);
      if (!cols.has('id') || !cols.has(deltaCol)) continue;
      const sql = sinceMs > 0
        ? `SELECT * FROM ${table.name} WHERE ${deltaCol} > ?`
        : `SELECT * FROM ${table.name}`;
      raw = sinceMs > 0 ? db.prepare(sql).all(sinceMs) : db.prepare(sql).all();
    }
    if (!raw.length) continue;
    rows[table.wire ?? table.name] = raw.map((r) =>
      sanitizeRowForWire(r, table.excludePush, deltaCol),
    );
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
 * @param {TableSpec} tableSpec
 * @param {Record<string, unknown>} row
 */
function applyLocalRow(db, tableSpec, row) {
  const table = tableSpec.name;
  const appendOnly = tableSpec.appendOnly === true;
  const validCols = pragmaColumns(db, table);
  /** @type {Record<string, unknown>} */
  let filtered = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'device_id' || k === 'deleted_at' || k === 'user_id') continue;
    if (tableSpec.applyRow) {
      filtered[k] = v; // custom appliers get the full wire row (minus system cols)
      continue;
    }
    if (!validCols.has(k)) continue;
    if (BOOLEAN_WIRE_COLUMNS.has(k)) {
      filtered[k] = v === true || v === 1 ? 1 : 0;
      continue;
    }
    filtered[k] = v;
  }
  if (tableSpec.applyRow) {
    tableSpec.applyRow(db, filtered);
    return;
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
 * Find the local table spec matching a wire key (pull answers with wire names).
 * @param {DomainName} domain
 * @param {string} wireKey
 */
function tableSpecForWire(domain, wireKey) {
  return DOMAIN_SPECS[domain].tables.find((t) => (t.wire ?? t.name) === wireKey || t.name === wireKey) ?? null;
}

/**
 * Apply one pull page. Rows that fail (typically FK violations because the
 * parent arrives in a later page) are returned as orphans so the caller can
 * retry them once every page has been applied.
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {object} data
 * @param {string} localDeviceId
 * @returns {Array<{ tableSpec: TableSpec, row: Record<string, unknown> }>}
 */
function applyPullPayload(db, domain, data, localDeviceId) {
  const spec = DOMAIN_SPECS[domain];
  const tombstones = data.tombstones || [];
  /** @type {Array<{ tableSpec: TableSpec, row: Record<string, unknown> }>} */
  const orphans = [];

  for (const t of tombstones) {
    if (!t?.table || !t?.id) continue;
    const tableSpec = tableSpecForWire(domain, t.table);
    syncTombstone.applyRemoteTombstone(db, tableSpec?.name ?? t.table, t.id);
  }

  const rowsByTable = data.rows || {};
  for (const tableSpec of spec.tables) {
    const remoteRows = rowsByTable[tableSpec.wire ?? tableSpec.name] ?? rowsByTable[tableSpec.name];
    if (!Array.isArray(remoteRows) || remoteRows.length === 0) continue;
    const getLocal = tableSpec.applyRow
      ? null
      : db.prepare(`SELECT * FROM ${tableSpec.name} WHERE id = ?`);
    for (const remoteRow of remoteRows) {
      if (!remoteRow?.id) continue;
      const localRow = getLocal ? getLocal.get(remoteRow.id) : undefined;
      if (getLocal && !shouldApplyRemoteRow(localRow, remoteRow, localDeviceId)) continue;
      try {
        applyLocalRow(db, tableSpec, remoteRow);
      } catch (err) {
        orphans.push({ tableSpec, row: remoteRow });
        if (orphans.length <= 3) {
          console.warn(`[domain-sync] deferred row ${tableSpec.name}/${remoteRow.id}:`, err?.message);
        }
      }
    }
  }
  return orphans;
}

/**
 * Retry rows deferred during page application (parents should exist by now).
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ tableSpec: TableSpec, row: Record<string, unknown> }>} orphans
 */
function retryOrphanRows(db, orphans) {
  let remaining = orphans;
  for (let pass = 0; pass < 3 && remaining.length > 0; pass += 1) {
    /** @type {typeof orphans} */
    const next = [];
    for (const { tableSpec, row } of remaining) {
      try {
        applyLocalRow(db, tableSpec, row);
      } catch {
        next.push({ tableSpec, row });
      }
    }
    if (next.length === remaining.length) {
      remaining = next;
      break; // no progress — stop
    }
    remaining = next;
  }
  if (remaining.length > 0) {
    console.warn(`[domain-sync] ${remaining.length} rows could not be applied (missing parents)`);
  }
  return remaining.length;
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
  /** @type {Array<{ tableSpec: TableSpec, row: Record<string, unknown> }>} */
  let orphans = [];

  for (;;) {
    const url = `${base}/api/v1/data/${domain}/pull?since=${encodeURIComponent(cursor)}&limit=${DOMAIN_PULL_LIMIT}`;
    const res = await domeOauth.fetchWithDomeAuth(deps.database, url, { method: 'GET' });
    if (!res.ok) {
      const t = await res.text();
      return { success: false, error: `${res.status} ${t}` };
    }
    const data = await res.json();
    orphans = orphans.concat(applyPullPayload(db, domain, data, localDeviceId));
    const rowCount = Object.values(data.rows || {}).reduce(
      (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
    applied += rowCount + (data.tombstones?.length || 0);
    cursor = data.nextSince ?? cursor;
    pages += 1;
    if (!data.hasMore) break;
    if (pages > 200) {
      console.warn('[domain-sync] pull pagination safety stop', domain);
      break;
    }
  }

  if (orphans.length > 0) {
    retryOrphanRows(db, orphans);
  }

  setDomainState(db, domain, { lastPullCursor: cursor });
  runPostPullHooks(deps, db, domain, applied);
  return { success: true, applied, nextSince: cursor };
}

/**
 * Domain-specific reactions after a pull applied remote changes.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {number} applied
 */
function runPostPullHooks(deps, db, domain, applied) {
  if (applied <= 0) return;
  if (domain === 'social') {
    deps.windowManager?.broadcast?.('social:posts-refresh', {});
  }
  if (domain === 'calendar') {
    adoptOrphanCalendarEvents(db, deps.windowManager);
  }
  if (domain === 'settings') {
    settingsSyncBridge.applySyncedSettingsToLocal(db, deps.windowManager);
  }
  if (domain === 'library') {
    // FTS stays consistent via triggers; embeddings/graph are derived and
    // re-indexed in background for anything the pull just created.
    try {
      const scheduler = require('./semantic-index-scheduler.cjs');
      void scheduler.indexMissingResources?.();
    } catch (err) {
      console.warn('[domain-sync] post-pull reindex failed:', err?.message);
    }
    deps.windowManager?.broadcast?.('resource:updated', { source: 'domain-sync' });
  }
  if (domain === 'agents' || domain === 'learn' || domain === 'conversations') {
    deps.windowManager?.broadcast?.('domain-sync:completed', { domain, applied });
  }
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
 * El wire de calendar_events no lleva project_id (contrato §3.3); el proyecto
 * del evento se deriva localmente vía calendar_calendars → calendar_accounts.
 * Para que Companion pueda aislar el calendario por proyecto, se estampa
 * `metadata.projectId` (columna `metadata` sí viaja, desktop-only) antes del
 * push. Solo toca filas sin projectId y les sube updated_at para que entren
 * en el delta.
 * @param {import('better-sqlite3').Database} db
 */
function backfillCalendarEventProjectMetadata(db) {
  try {
    db.prepare(
      `
        UPDATE calendar_events
        SET metadata = json_set(COALESCE(metadata, '{}'), '$.projectId',
              (SELECT COALESCE(a.project_id, 'default')
               FROM calendar_calendars c
               LEFT JOIN calendar_accounts a ON a.id = c.account_id
               WHERE c.id = calendar_events.calendar_id)),
            updated_at = ?
        WHERE (metadata IS NULL OR json_extract(metadata, '$.projectId') IS NULL)
          AND calendar_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM calendar_calendars c WHERE c.id = calendar_events.calendar_id)
      `,
    ).run(Date.now());
  } catch (err) {
    console.warn('[domain-sync] calendar project backfill failed:', err?.message);
  }
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
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST one push payload with 429 backoff. Marks the batch's tombstones synced
 * on success. Does NOT touch domain_sync_state — callers own cursor/lastPushAt.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 * @param {DomainName} domain
 * @param {Record<string, Record<string, unknown>[]>} rows
 * @param {Array<{ table: string, id: string, deletedAt: number }>} tombstones
 */
async function sendPushRequest(deps, db, domain, rows, tombstones) {
  const deviceId = getOrCreateDeviceId(db);
  // Los tombstones se registran con el nombre de tabla LOCAL (vault_blobs,
  // synced_settings, many_session_index); el catálogo del provider solo
  // conoce el nombre wire — sin mapear responde 422 unknown_table y bloquea
  // el push del dominio entero.
  const wireTombstones = tombstones.map((t) => {
    const spec = DOMAIN_SPECS[domain]?.tables.find((tbl) => tbl.name === t.table);
    return spec?.wire ? { ...t, table: spec.wire } : t;
  });
  const body = JSON.stringify({ deviceId, rows, tombstones: wireTombstones });
  const url = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/data/${domain}/push`;

  for (let attempt = 0; ; attempt += 1) {
    const res = await domeOauth.fetchWithDomeAuth(deps.database, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status === 429 && attempt < PUSH_429_MAX_RETRIES) {
      let retryAfterSec = Number(res.headers?.get?.('retry-after'));
      if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) {
        try {
          retryAfterSec = Number((await res.json())?.retryAfter);
        } catch {
          retryAfterSec = 0;
        }
      }
      const waitMs = Math.min(
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 2000 * 2 ** attempt,
        30_000,
      );
      console.warn(`[domain-sync] push 429 for ${domain}, retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      return { success: false, error: `${res.status} ${t}` };
    }
    const data = await res.json();
    if (tombstones.length) {
      syncTombstone.markTombstonesSynced(db, tombstones);
    }
    return { success: true, data };
  }
}

/**
 * Split a full push payload into wire batches that respect the server limits
 * (≤500 rows incl. tombstones, ≤5MB body). Table order (parent→child) is
 * preserved across sequential batches.
 * @param {Record<string, Record<string, unknown>[]>} rows
 * @param {Array<{ table: string, id: string, deletedAt: number }>} tombstones
 */
function buildPushBatches(rows, tombstones) {
  /** @type {Array<{ rows: Record<string, Record<string, unknown>[]>, tombstones: any[] }>} */
  const batches = [];
  let current = { rows: {}, tombstones: [] };
  let count = 0;
  let bytes = 0;

  const flush = () => {
    if (count > 0) batches.push(current);
    current = { rows: {}, tombstones: [] };
    count = 0;
    bytes = 0;
  };

  for (const [table, tableRows] of Object.entries(rows)) {
    for (const row of tableRows) {
      const rowBytes = JSON.stringify(row).length + table.length + 8;
      if (count > 0 && (count + 1 > PUSH_BATCH_MAX_ROWS || bytes + rowBytes > PUSH_BATCH_MAX_BYTES)) {
        flush();
      }
      (current.rows[table] ??= []).push(row);
      count += 1;
      bytes += rowBytes;
    }
  }
  for (const t of tombstones) {
    if (count > 0 && count + 1 > PUSH_BATCH_MAX_ROWS) flush();
    current.tombstones.push(t);
    count += 1;
  }
  flush();
  return batches;
}

/**
 * Single-request push used by adapters for small targeted writes (e.g. the
 * social cloud toggle). Keeps the legacy behavior of updating domain state.
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
  const pushStartedAt = Date.now();
  const sent = await sendPushRequest(deps, db, domain, rows, tombstones);
  if (!sent.success) return sent;

  const data = sent.data;
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
 * Full delta push for a domain, batched to the wire limits. Domain state is
 * updated once at the end with the pre-snapshot timestamp so rows mutated
 * mid-push are re-pushed on the next cycle instead of being lost.
 * @param {object} deps
 * @param {object} deps.database
 * @param {DomainName} domain
 */
async function pushDomain(deps, domain) {
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

  backfillSocialMetricsUpdatedAt(db);
  if (domain === 'settings') {
    // Settings escritos fuera de los handlers IPC espejados (main process,
    // valores previos a la feature) solo llegan a la nube vía este reconcile.
    settingsSyncBridge.reconcileSyncedSettingsFromLocal(db);
  }
  if (domain === 'calendar') {
    backfillCalendarEventProjectMetadata(db);
  }
  const pushStartedAt = Date.now();
  const rows = buildPushRows(db, domain, state.lastPushAt);
  const tombstones = syncTombstone.getPendingTombstones(db, domain);
  const batches = buildPushBatches(rows, tombstones);

  let applied = 0;
  let skipped = 0;
  let rejected = 0;
  let nextSince;
  for (const batch of batches) {
    const sent = await sendPushRequest(deps, db, domain, batch.rows, batch.tombstones);
    if (!sent.success) {
      console.warn(`[domain-sync] push ${domain} failed:`, String(sent.error).slice(0, 300));
      return sent;
    }
    applied += sent.data.applied ?? 0;
    skipped += sent.data.skipped?.length ?? 0;
    rejected += sent.data.rejected?.length ?? 0;
    if (Array.isArray(sent.data.rejected) && sent.data.rejected.length > 0) {
      const sample = sent.data.rejected.slice(0, 3);
      console.warn(
        `[domain-sync] push ${domain}: ${sent.data.rejected.length} rows rejected`,
        JSON.stringify(sample),
      );
    }
    nextSince = sent.data.nextSince ?? nextSince;
  }

  // Rejected rows (e.g. transient db_error on the server) must be retried on
  // the next cycle: advancing lastPushAt past their updated_at would silently
  // drop them from every future delta push.
  setDomainState(db, domain, {
    ...(rejected === 0 ? { lastPushAt: pushStartedAt } : {}),
    lastPullCursor: nextSince ?? state.lastPullCursor,
  });
  return { success: true, applied, skipped, rejected, batches: batches.length };
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
  buildPushBatches,
  sanitizeRowForWire,
  applyPullPayload,
  retryOrphanRows,
};
