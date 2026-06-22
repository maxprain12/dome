/* eslint-disable no-console */
/**
 * Dome cloud sync — Provider API + local SQLite apply (LWW by server revision).
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const vaultStore = require('./vault-store.cjs');

const SYNC_SCHEMA_VERSION = 3;

const SYNC_TABLES = [
  'projects',
  'resources',
  'tags',
  'resource_tags',
  'sources',
  'artifacts',
  'resource_interactions',
];

/**
 * @param {import('better-sqlite3').Database} db
 */
async function getOrCreateDeviceId(db) {
  try {
    const row = await db.get('SELECT device_id FROM dome_cloud_sync WHERE id = 1');
    if (row?.device_id) return row.device_id;
  } catch {
    return crypto.randomUUID();
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.run(
    `
      INSERT INTO dome_cloud_sync (id, device_id, last_server_revision, last_event_poll_at, updated_at)
      VALUES (1, ?, 0, 0, ?)
      ON CONFLICT(id) DO UPDATE SET device_id = excluded.device_id, updated_at = excluded.updated_at
    `,
    [id, now],
  );
  return id;
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function getLocalRevision(db) {
  try {
    const row = await db.get('SELECT last_server_revision FROM dome_cloud_sync WHERE id = 1');
    return row?.last_server_revision ?? 0;
  } catch {
    return 0;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function setLocalRevision(db, rev) {
  const now = Date.now();
  const dev = await getOrCreateDeviceId(db);
  await db.run(
    `
      INSERT INTO dome_cloud_sync (id, device_id, last_server_revision, last_event_poll_at, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_server_revision = excluded.last_server_revision, updated_at = excluded.updated_at
    `,
    [dev, rev, now, now],
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function getLastPushAt(db) {
  try {
    const row = await db.get('SELECT last_push_at FROM dome_cloud_sync WHERE id = 1');
    return row?.last_push_at ?? 0;
  } catch {
    return 0;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function setLastPushAt(db, ts) {
  const dev = await getOrCreateDeviceId(db);
  const now = Date.now();
  await db.run(
    `INSERT INTO dome_cloud_sync (id, device_id, last_push_at, last_server_revision, last_event_poll_at, updated_at)
     VALUES (1, ?, ?, 0, 0, ?)
     ON CONFLICT(id) DO UPDATE SET last_push_at = excluded.last_push_at, updated_at = excluded.updated_at`,
    [dev, ts, now],
  );
}

/**
 * Build a payload containing only rows modified since `sinceMs`.
 * Tables without updated_at (tags, resource_tags) are always included in full.
 * @param {import('better-sqlite3').Database} db
 * @param {number} sinceMs — 0 means full snapshot
 */
async function buildDelta(db, sinceMs) {
  const isFullSync = sinceMs === 0;
  const since = sinceMs;

  const projects = isFullSync
    ? await db.all('SELECT * FROM projects')
    : await db.all('SELECT * FROM projects WHERE updated_at > ?', [since]);

  const resources = (
    isFullSync
      ? await db.all('SELECT * FROM resources')
      : await db.all('SELECT * FROM resources WHERE updated_at > ?', [since])
  ).map((r) => {
    const row = { ...r };
    if ('thumbnail_data' in row) delete row.thumbnail_data;
    return row;
  });

  const sources = isFullSync
    ? await db.all('SELECT * FROM sources')
    : await db.all('SELECT * FROM sources WHERE updated_at > ?', [since]);

  const interactions = isFullSync
    ? await db.all('SELECT * FROM resource_interactions')
    : await db.all('SELECT * FROM resource_interactions WHERE updated_at > ?', [since]);

  const artifacts = isFullSync
    ? await db.all('SELECT * FROM artifacts')
    : await db.all('SELECT * FROM artifacts WHERE updated_at > ?', [since]);

  // No updated_at — always send full (they're small)
  const tags = await db.all('SELECT * FROM tags');
  const resource_tags = await db.all('SELECT * FROM resource_tags');

  return {
    syncSchemaVersion: SYNC_SCHEMA_VERSION,
    capturedAt: Date.now(),
    kind: isFullSync ? 'full' : 'delta',
    tables: {
      projects,
      resources,
      tags,
      resource_tags,
      sources,
      artifacts,
      resource_interactions: interactions,
    },
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function pragmaColumns(db, table) {
  return (await db.all(`PRAGMA table_info(${table})`)).map((c) => c.name);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
async function upsertRows(db, table, rows) {
  if (!rows?.length) return;
  const validCols = new Set(await pragmaColumns(db, table));
  const hasId = validCols.has('id');
  for (const raw of rows) {
    const row = /** @type {Record<string, unknown>} */ ({});
    for (const [k, v] of Object.entries(raw)) {
      if (validCols.has(k)) row[k] = v;
    }
    if (table === 'resources' && 'thumbnail_data' in row) delete row.thumbnail_data;
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const placeholders = keys.map(() => '?').join(',');
    const values = keys.map((k) => row[k]);
    // DuckDB rejects `INSERT OR REPLACE` on tables with more than one
    // UNIQUE/PRIMARY KEY constraint (it can't infer a conflict target). Emulate
    // the replace by deleting the existing row by its primary key (`id`) first,
    // then inserting. Best-effort per row so one bad row doesn't abort the sync.
    try {
      if (hasId && row.id != null) {
        await db.run(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
      }
      await db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, values);
    } catch (err) {
      console.warn(`[cloud-sync] upsert ${table} row failed:`, err?.message || err);
    }
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Record<string, unknown>} payload
 * @param {string} localDeviceId
 */
async function applyBundlePayload(db, payload) {
  const tables = payload?.tables;
  if (!tables || typeof tables !== 'object') return;

  // FK order: parents before children
  /** @type {{ table: string, rows: unknown[] }[]} */
  const order = [
    { table: 'projects', rows: tables.projects },
    { table: 'tags', rows: tables.tags },
    { table: 'resources', rows: tables.resources },
    { table: 'artifacts', rows: tables.artifacts },
    { table: 'sources', rows: tables.sources },
    { table: 'resource_tags', rows: tables.resource_tags },
    { table: 'resource_interactions', rows: tables.resource_interactions },
  ];

  await db.transaction(async (tx) => {
    for (const { table, rows } of order) {
      if (!Array.isArray(rows)) continue;
      if (!SYNC_TABLES.includes(table)) continue;
      await upsertRows(tx, table, rows);
    }
  });
}

/**
 * Upload internal files for resources (best-effort).
 * @param {import('better-sqlite3').Database} db
 * @param {import('./file-storage.cjs')} fileStorage
 * @param {import('../auth/dome-oauth.cjs')} oauthModule
 * @param {Object} database
 */
async function uploadResourceFiles(db, fileStorage, database, oauthModule) {
  const rows = await db.all(`SELECT id, internal_path, file_mime_type FROM resources WHERE internal_path IS NOT NULL AND trim(internal_path) != ''`);
  const base = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/sync/blob`;

  for (const r of rows) {
    const full = fileStorage.getFullPath(r.internal_path);
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    const rel = `files/${r.id}/${pathBasename(r.internal_path)}`;
    const body = JSON.stringify({
      path: rel,
      contentBase64: buf.toString('base64'),
      contentType: r.file_mime_type || 'application/octet-stream',
    });
    let res = await oauthModule.fetchWithDomeAuth(database, base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn('[cloud-sync] blob upload failed', r.id, res.status, t);
    }
  }
}

function pathBasename(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'blob';
}

/**
 * Download blobs referenced in payload (files/{resourceId}/...).
 * @param {import('better-sqlite3').Database} db
 * @param {import('./file-storage.cjs')} fileStorage
 * @param {Object} database
 * @param {import('../auth/dome-oauth.cjs')} oauthModule
 * @param {Record<string, unknown>} payload
 */
async function downloadResourceFiles(db, fileStorage, database, oauthModule, payload) {
  const resources = payload?.tables?.resources;
  if (!Array.isArray(resources)) return;
  const baseUrl = getDomeProviderBaseUrl().replace(/\/$/, '');
  for (const res of resources) {
    if (!res.internal_path || !res.id) continue;
    const rel = `files/${res.id}/${pathBasename(res.internal_path)}`;
    const signUrl = `${baseUrl}/api/v1/sync/blob?path=${encodeURIComponent(rel)}`;
    let r = await oauthModule.fetchWithDomeAuth(database, signUrl, { method: 'GET' });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    if (!j?.signedUrl) continue;
    let fileRes = await fetch(j.signedUrl);
    if (!fileRes.ok) continue;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    fileStorage.overwriteFile(res.internal_path, buf);
  }
}

/**
 * Upload every vault file (notes `.md` AND binaries) as a blob at
 * `vault/<vault_path>`. The row-sync carries vault_path + caches; this ships the
 * actual bytes so every device has the portable vault on disk.
 */
async function uploadVaultFiles(db, fileStorage, database, oauthModule) {
  const rows = await db.all(`SELECT id, project_id, vault_path, file_mime_type FROM resources WHERE type != 'folder' AND vault_path IS NOT NULL AND trim(vault_path) != ''`);
  const queries = database.getQueries();
  const base = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/sync/blob`;
  for (const r of rows) {
    const root = vaultStore.getProjectVaultRoot(r.project_id, queries, fileStorage);
    const full = require('path').join(root, r.vault_path);
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    const body = JSON.stringify({
      path: `vault/${r.vault_path}`,
      contentBase64: buf.toString('base64'),
      contentType: r.file_mime_type || (r.vault_path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream'),
    });
    const res = await oauthModule.fetchWithDomeAuth(database, base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[cloud-sync] vault blob upload failed', r.id, res.status, t);
    }
  }
}

/** Download vault files (notes + binaries) referenced in a pulled payload. */
async function downloadVaultFiles(db, fileStorage, database, oauthModule, payload) {
  const resources = payload?.tables?.resources;
  if (!Array.isArray(resources)) return;
  const queries = database.getQueries();
  const baseUrl = getDomeProviderBaseUrl().replace(/\/$/, '');
  const pathMod = require('path');
  for (const res of resources) {
    if (res.type === 'folder' || !res.vault_path) continue;
    const rel = `vault/${res.vault_path}`;
    const signUrl = `${baseUrl}/api/v1/sync/blob?path=${encodeURIComponent(rel)}`;
    const r = await oauthModule.fetchWithDomeAuth(database, signUrl, { method: 'GET' });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    if (!j?.signedUrl) continue;
    const fileRes = await fetch(j.signedUrl);
    if (!fileRes.ok) continue;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const root = vaultStore.getProjectVaultRoot(res.project_id, queries, fileStorage);
    const abs = pathMod.join(root, res.vault_path);
    try {
      if (!fs.existsSync(pathMod.dirname(abs))) fs.mkdirSync(pathMod.dirname(abs), { recursive: true });
      vaultStore.markSelfWrite(abs, vaultStore.contentHash(buf));
      fs.writeFileSync(abs, buf);
      await db.run('UPDATE resources SET content_hash = ? WHERE id = ?', [vaultStore.contentHash(buf), res.id]);
    } catch (e) {
      console.warn('[cloud-sync] vault file write failed', res.id, e.message);
    }
  }
}

async function runEmbeddingReindex(database, windowManager) {
  try {
    const semanticIndexScheduler = require('./semantic-index-scheduler.cjs');
    semanticIndexScheduler.init(database);
    const db = database.getDB?.();
    if (!db) return;
    const INDEXABLE_TYPES = ['pdf', 'note', 'document', 'url', 'notebook', 'ppt', 'excel', 'image', 'artifact'];
    const placeholders = INDEXABLE_TYPES.map(() => '?').join(',');
    const resources = await db.all(
      `SELECT id, type, title FROM resources
       WHERE type IN (${placeholders})
       ORDER BY updated_at DESC`,
      INDEXABLE_TYPES,
    );
    for (const res of resources) {
      try {
        await semanticIndexScheduler.getIndexer().indexResource(res.id, { skipSemanticRelations: true });
      } catch (e) {
        console.warn('[cloud-sync] reindex', res.id, e?.message || e);
      }
    }
    try {
      windowManager?.broadcast?.('cloud-sync:reindex-done', { ok: true });
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[cloud-sync] reindex failed', e?.message || e);
  }
}

/**
 * @param {Object} deps
 * @param {Object} deps.database
 * @param {Object} deps.fileStorage
 * @param {Object} [deps.windowManager]
 */
async function pushFullSync(deps) {
  const { database, fileStorage, windowManager } = deps;
  const db = database.getDB?.();
  if (!db) return { success: false, error: 'No database' };

  const deviceId = await getOrCreateDeviceId(db);
  let localRev = await getLocalRevision(db);
  const remote = await getRemoteStatus(database);
  if (remote.success && remote.currentRevision > localRev) {
    const pulled = await pullAndApply({ database, fileStorage, windowManager });
    if (!pulled.success) return { success: false, error: pulled.error || 'pull_failed' };
    localRev = await getLocalRevision(db);
  }

  const lastPushAt = await getLastPushAt(db);
  const pushStartedAt = Date.now();
  const delta = await buildDelta(db, lastPushAt);
  delta.deviceId = deviceId;

  await uploadResourceFiles(db, fileStorage, database, domeOauth);
  await uploadVaultFiles(db, fileStorage, database, domeOauth);

  const body = JSON.stringify({
    deviceId,
    baseRevision: localRev,
    syncSchemaVersion: SYNC_SCHEMA_VERSION,
    payload: delta,
  });

  const url = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/sync/push`;
  let res = await domeOauth.fetchWithDomeAuth(database, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (res.status === 409) {
    await res.json().catch(() => ({}));
    const pullResult = await pullAndApply({ database, fileStorage, windowManager });
    if (!pullResult.success) return { success: false, error: pullResult.error || 'pull_failed_after_409' };
    const newLocal = await getLocalRevision(db);
    const retryDelta = await buildDelta(db, lastPushAt);
    retryDelta.deviceId = deviceId;
    const retryBody = JSON.stringify({
      deviceId,
      baseRevision: newLocal,
      syncSchemaVersion: SYNC_SCHEMA_VERSION,
      payload: retryDelta,
    });
    res = await domeOauth.fetchWithDomeAuth(database, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: retryBody,
    });
  }

  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: `${res.status} ${t}` };
  }

  const data = await res.json();
  const newRev = Number(data.newRevision);
  if (Number.isFinite(newRev)) {
    await setLocalRevision(db, newRev);
    await setLastPushAt(db, pushStartedAt);
  }
  try {
    windowManager?.broadcast?.('cloud-sync:pushed', { newRevision: newRev });
  } catch {
    /* ignore */
  }
  return { success: true, newRevision: newRev };
}

/**
 * @param {Object} deps
 * @param {Object} deps.database
 * @param {Object} deps.fileStorage
 * @param {Object} [deps.windowManager]
 */
async function pullAndApply(deps) {
  const { database, fileStorage, windowManager } = deps;
  const db = database.getDB?.();
  if (!db) return { success: false, error: 'No database' };

  const deviceId = await getOrCreateDeviceId(db);
  let since = await getLocalRevision(db);
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const limit = 100;
  let maxRev = since;

  for (;;) {
    const url = `${base}/api/v1/sync/pull?since=${since}&limit=${limit}`;
    const res = await domeOauth.fetchWithDomeAuth(database, url, { method: 'GET' });
    if (!res.ok) {
      const t = await res.text();
      return { success: false, error: `${res.status} ${t}` };
    }
    const data = await res.json();
    const mutations = data.mutations || [];
    if (mutations.length === 0) break;

    for (const m of mutations) {
      const rev = Number(m.revision);
      if (rev > maxRev) maxRev = rev;
      if (m.device_id === deviceId) continue;
      if (m.kind === 'bundle' && m.payload) {
        await applyBundlePayload(db, m.payload);
        await downloadResourceFiles(db, fileStorage, database, domeOauth, m.payload);
        await downloadVaultFiles(db, fileStorage, database, domeOauth, m.payload);
      }
    }

    if (mutations.length < limit) break;
    since = mutations[mutations.length - 1].revision;
  }

  await setLocalRevision(db, maxRev);

  try {
    database.invalidateQueries?.();
  } catch {
    /* ignore */
  }
  try {
    windowManager?.broadcast?.('cloud-sync:pull-done', { revision: maxRev });
  } catch {
    /* ignore */
  }

  setImmediate(() => {
    runEmbeddingReindex(database, windowManager);
  });

  return { success: true, revision: maxRev };
}

/**
 * @param {Object} database
 */
async function getRemoteStatus(database) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = `${base}/api/v1/sync/status`;
  const res = await domeOauth.fetchWithDomeAuth(database, url, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: `${res.status} ${t}` };
  }
  const data = await res.json();
  return {
    success: true,
    currentRevision: data.currentRevision ?? 0,
    syncSchemaVersion: data.syncSchemaVersion ?? 1,
  };
}

module.exports = {
  SYNC_SCHEMA_VERSION,
  getOrCreateDeviceId,
  getLocalRevision,
  buildDelta,
  pushFullSync,
  pullAndApply,
  getRemoteStatus,
  runEmbeddingReindex,
};
