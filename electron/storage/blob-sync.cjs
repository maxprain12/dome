'use strict';

/**
 * Vault blob sync — `files` domain companion (contract §3.5).
 *
 * The `vault_blobs` table is the syncable manifest (rows travel through the
 * generic Domain Sync engine); this module moves the BYTES out of band via
 * the provider's content-addressed endpoints:
 *   POST /api/v1/files/stat          → which hashes already exist (dedupe)
 *   POST /api/v1/files/upload-url    → quota check + signed upload URL
 *   GET  /api/v1/files/download-url  → signed download URL
 *
 * Three phases, all incremental and idempotent:
 *   1. ingestLocalFiles  — vault files without a manifest row get hashed
 *                          (full sha256) and enqueued (`upload_state=pending`).
 *   2. runUploadQueue    — pending blobs are stat-deduped and streamed up
 *                          (never base64 — that was the historic egress bug).
 *   3. hydrateMissingFiles — resources whose backing file is missing locally
 *                          (fresh device restore) are downloaded back into
 *                          the project vault at their canonical vault_path.
 */
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('stream/promises');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const fileStorage = require('./file-storage.cjs');
const vaultStore = require('./vault-store.cjs');

const STAT_BATCH = 500;
/** El provider exige sha256 hex completo; un solo hash inválido rechaza el batch entero (422). */
const FULL_HASH_RE = /^[0-9a-f]{64}$/;
let running = false;
/** Los blobs `skipped` (límite de tamaño) se reintentan UNA vez por sesión. */
let requeuedSkippedThisSession = false;
/**
 * Full sha256 (streamed — vault files can be hundreds of MB).
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function computeFullHash(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** Resolve only the canonical project vault file. */
function resolveResourceAbsPath(resource, queries) {
  return vaultStore.getResourceFilePath(resource, queries, fileStorage);
}

/**
 * Repair pass: manifest rows whose hash is not a full sha256 (legacy 16-char
 * prefixes copied from resources.file_hash). Recompute from the local file and
 * update in place (same id + bumped updated_at → the fixed row re-pushes and
 * wins by LWW in the cloud manifest); drop rows we cannot repair.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [queries]
 */
async function repairInvalidManifestHashes(db, queries) {
  const bad = db
    .prepare("SELECT id, hash FROM vault_blobs WHERE LENGTH(hash) != 64 OR hash GLOB '*[^0-9a-f]*'")
    .all();
  if (!bad.length) return;
  const repairStatements = prepareManifestHashRepair(db);
  for (const row of bad) {
    await repairOneBadRow(row, repairStatements.findResource, repairStatements.findByHash, repairStatements.update, queries, repairStatements.drop);
  }
}

function prepareManifestHashRepair(db) {
  const syncTombstone = require('./sync-tombstone.cjs');
  const findByHash = db.prepare('SELECT id FROM vault_blobs WHERE hash = ? AND id != ? LIMIT 1');
  const findResource = db.prepare(
    `SELECT id, project_id, vault_path FROM resources
     WHERE file_hash = ? OR file_hash LIKE ? || '%' LIMIT 1`,
  );
  const update = db.prepare('UPDATE vault_blobs SET hash = ?, updated_at = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM vault_blobs WHERE id = ?');
  // El tombstone limpia la copia mala que ya viajó al manifiesto cloud.
  const drop = (id) => {
    remove.run(id);
    syncTombstone.recordTombstone(db, 'vault_blobs', id);
  };
  return { findByHash, findResource, update, drop };
}

/**
 * Try to repair one `vault_blobs` row whose hash is not a valid sha256:
 * recompute the full hash from the local file (if any) and either drop the
 * bad row (when a good one already exists or the file is gone) or update it
 * with the corrected hash so the manifest re-pushes.
 * @returns {Promise<void>}
 */
async function repairOneBadRow(row, findResource, findByHash, update, queries, drop) {
  const resource = findResource.get(row.hash, row.hash);
  const fullPath = resource ? resolveResourceAbsPath(resource, queries) : null;
  if (!fullPath || !fs.existsSync(fullPath)) {
    drop(row.id);
    return;
  }
  await repairBadRowHashSafely(row, fullPath, findByHash, update, drop);
}

async function repairBadRowHashSafely(row, fullPath, findByHash, update, drop) {
  try {
    await repairBadRowHash(row, fullPath, findByHash, update, drop);
  } catch (err) {
    handleBadRowHashRepairFailure(row, drop, err);
  }
}

function handleBadRowHashRepairFailure(row, drop, err) {
  console.warn('[blob-sync] hash repair failed:', err?.message);
  drop(row.id);
}

async function repairBadRowHash(row, fullPath, findByHash, update, drop) {
  const fullHash = await computeFullHash(fullPath);
  if (findByHash.get(fullHash, row.id)) {
    // El ingest ya creó la fila buena para este archivo: la mala sobra.
    drop(row.id);
    console.log(`[blob-sync] dropped duplicate bad-hash row ${row.hash}`);
  } else {
    update.run(fullHash, Date.now(), row.id);
    console.log(`[blob-sync] repaired manifest hash ${row.hash} → ${fullHash.slice(0, 12)}…`);
  }
}

/** Register the current canonical bytes; an edit must invalidate the old hash. */
async function ingestOneResource(resource, fullPath, db, findByHash, insert) {
  try {
    const hash = FULL_HASH_RE.test(String(resource.content_hash || ''))
      ? resource.content_hash : await computeFullHash(fullPath);
    if (resource.file_hash !== hash) {
      db.prepare('UPDATE resources SET file_hash = ?, updated_at = ? WHERE id = ?')
        .run(hash, Date.now(), resource.id);
    }
    if (findByHash.get(hash)) return false;
    return insertManifestRow(insert, resource, fullPath, hash);
  } catch (err) {
    console.warn('[blob-sync] ingest failed for', resource.id, err?.message);
    return false;
  }
}

/**
 * Write the `vault_blobs` manifest row for one resource. Returns whether a
 * new row was actually inserted.
 */
function insertManifestRow(insert, resource, fullPath, hash) {
  const size = fs.statSync(fullPath).size;
  const now = Date.now();
  const result = insert.run(
    crypto.randomUUID(),
    hash,
    size,
    resource.file_mime_type || null,
    resource.original_filename || path.basename(fullPath),
    now,
    now,
  );
  return result.changes > 0;
}

async function ingestResourceIfPresent(resource, db, queries, findByHash, insert) {
  const fullPath = resolveResourceAbsPath(resource, queries);
  if (!fullPath || !fs.existsSync(fullPath)) return false;
  return ingestOneResource(resource, fullPath, db, findByHash, insert);
}

async function ingestResources(resources, db, queries, findByHash, insert) {
  let ingested = 0;
  for (const resource of resources) {
    ingested += Number(
      await ingestResourceIfPresent(resource, db, queries, findByHash, insert),
    );
  }
  return ingested;
}

function logIngestedCount(ingested) {
  if (ingested > 0) console.log(`[blob-sync] ingested ${ingested} new vault blobs`);
}

/**
 * Phase 1 — make sure every local resource file has a manifest row.
 * Resolves every resource through its project vault.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [queries]
 * @returns {Promise<number>} number of new vault_blobs rows inserted
 */
async function ingestLocalFiles(db, queries) {
  await repairInvalidManifestHashes(db, queries);
  const resources = db
    .prepare(
      `SELECT id, project_id, vault_path, content_hash, file_hash, file_mime_type, original_filename
       FROM resources
       WHERE vault_path IS NOT NULL AND vault_path != '' AND type != 'folder'`,
    )
    .all();
  const findByHash = db.prepare('SELECT id FROM vault_blobs WHERE hash = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vault_blobs
      (id, hash, size_bytes, mime, original_name, upload_state, local_state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 'present', ?, ?)
  `);

  const ingested = await ingestResources(resources, db, queries, findByHash, insert);
  logIngestedCount(ingested);
  return ingested;
}

/**
 * Fold one `uploadPendingBlob` outcome into the batch counters and decide
 * whether to stop the loop. Returning a non-null flags forces an early
 * exit with the given extra fields (rateLimited / error). Returned null
 * means "keep iterating".
 * @param {{ kind: string }} outcome
 * @param {{ uploaded: number, deduped: number }} counts mutated in place
 * @returns {{ rateLimited?: boolean, error?: string } | null}
 */
function tallyBatchOutcome(outcome, counts) {
  if (outcome.kind === 'deduped') {
    counts.deduped += 1;
    return null;
  }
  if (outcome.kind === 'uploaded') {
    counts.uploaded += 1;
    return null;
  }
  if (outcome.kind === 'rate-limited') {
    // Rate limit del provider (30 req/min): los pendientes siguen en
    // cola y el siguiente tick (60 s) continúa con cupo fresco.
    console.warn(`[blob-sync] upload-url rate-limited — ${counts.uploaded} uploaded, resuming next tick`);
    return { rateLimited: true };
  }
  if (outcome.kind === 'quota-exceeded') {
    return { error: 'storage_quota_exceeded' };
  }
  return null;
}

/**
 * Process one upload batch: stat-dedupe against the provider, resolve any
 * local paths from the resource rows, then upload each blob.
 * Extracted from `runUploadQueue` to keep it under the cognitive-complexity
 * threshold. Translates provider errors and rate-limit into early-exit flags
 * that the caller can fold into its cumulative counters.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 * @param {Array<object>} batch
 * @param {string} base
 * @param {import('better-sqlite3').Statement} markUploaded
 * @param {import('better-sqlite3').Statement} markSkipped
 * @returns {Promise<{ uploaded: number, deduped: number, rateLimited?: boolean, error?: string }>}
 */
async function processUploadBatch(deps, db, batch, base, markUploaded, markSkipped) {
  const queries = deps.database.getQueries?.();

  const statRes = await domeOauth.fetchWithDomeAuth(deps.database, `${base}/api/v1/files/stat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes: batch.map((b) => b.hash) }),
  });
  if (!statRes.ok) {
    console.warn('[blob-sync] stat failed:', statRes.status);
    return { uploaded: 0, deduped: 0, error: `stat_${statRes.status}` };
  }
  const { existing } = await statRes.json();
  const existingSet = new Set(existing || []);

  const counts = { uploaded: 0, deduped: 0 };
  for (const blob of batch) {
    const outcome = await uploadPendingBlob(
      deps,
      db,
      blob,
      base,
      existingSet,
      queries,
      markUploaded,
      markSkipped,
    );
    const earlyExit = tallyBatchOutcome(outcome, counts);
    if (earlyExit) return { uploaded: counts.uploaded, deduped: counts.deduped, ...earlyExit };
  }
  return { uploaded: counts.uploaded, deduped: counts.deduped };
}

/**
 * Drop manifest rows whose hash is not a full sha256 (defense in depth: a
 * malformed hash would 422 the entire stat batch and block all uploads).
 * Returns null when no valid blobs remain so the caller can short-circuit.
 * @param {Array<object>} rows
 * @returns {Array<object> | null}
 */
function pendingBlobsWithValidHashes(rows) {
  const pending = rows.filter((b) => FULL_HASH_RE.test(String(b.hash || '')));
  if (pending.length < rows.length) {
    console.warn(`[blob-sync] skipping ${rows.length - pending.length} manifest rows with invalid hash`);
  }
  return pending.length ? pending : null;
}

/**
 * Phase 2 — upload pending blobs (stat-deduped, streaming).
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 */
async function runUploadQueue(deps, db) {
  const rows = db
    .prepare("SELECT * FROM vault_blobs WHERE upload_state = 'pending'")
    .all();
  // Defensa en profundidad: un hash malformado que se cuele haría 422 al
  // batch de stat completo y bloquearía TODAS las subidas.
  const pending = pendingBlobsWithValidHashes(rows);
  if (!pending) return { uploaded: 0, deduped: 0 };

  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const markUploaded = db.prepare(
    "UPDATE vault_blobs SET upload_state = 'uploaded' WHERE id = ?",
  );
  const markSkipped = db.prepare(
    "UPDATE vault_blobs SET upload_state = 'skipped' WHERE id = ?",
  );

  let uploaded = 0;
  let deduped = 0;
  for (let i = 0; i < pending.length; i += STAT_BATCH) {
    const batch = pending.slice(i, i + STAT_BATCH);
    const result = await processUploadBatch(deps, db, batch, base, markUploaded, markSkipped);
    uploaded += result.uploaded;
    deduped += result.deduped;
    if (result.rateLimited) return { uploaded, deduped, rateLimited: true };
    if (result.error) return { uploaded, deduped, error: result.error };
  }
  if (uploaded || deduped) {
    console.log(`[blob-sync] uploads done: ${uploaded} uploaded, ${deduped} deduped`);
  }
  return { uploaded, deduped };
}

/**
 * HTTP statuses that mean "request is well-formed but the upload is
 * permanently rejected" — payload too large, payment required, or forbidden
 * by plan/policy. These collapse into the same skip-or-quota decision; the
 * caller should NOT retry.
 */
const UPLOAD_REJECT_STATUSES = new Set([413, 402, 403]);

/**
 * Request a signed upload URL for one blob and translate provider response
 * codes into a small outcome enum the caller can branch on.
 * @returns {Promise<
 *   { kind: 'ok', url: string }
 * | { kind: 'rate-limited' | 'quota-exceeded' | 'skipped' | 'error' | 'deduped' }
 * >}
 */
/**
 * One retry for transient undici "fetch failed" (DNS blip, socket reset).
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} label
 * @returns {Promise<T>}
 */
async function withTransientFetchRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    const msg = `${err?.message || err}`;
    const cause = err?.cause?.code || err?.cause?.message || '';
    const transient = /fetch failed|econnreset|etimedout|enotfound|socket hang up|network/i.test(
      `${msg} ${cause}`,
    );
    if (!transient) throw err;
    console.warn(`[blob-sync] ${label} transient (${msg}${cause ? `; ${cause}` : ''}); retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fn();
  }
}

async function requestUploadGrant(deps, base, blob) {
  const grantRes = await withTransientFetchRetry(
    () => domeOauth.fetchWithDomeAuth(
      deps.database,
      `${base}/api/v1/files/upload-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: blob.hash, sizeBytes: blob.size_bytes, mime: blob.mime }),
      },
    ),
    'upload-url',
  );
  if (grantRes.status === 429) {
    return { kind: 'rate-limited' };
  }
  if (UPLOAD_REJECT_STATUSES.has(grantRes.status)) {
    return translateUploadRejection(grantRes);
  }
  if (!grantRes.ok) {
    console.warn('[blob-sync] upload-url failed:', grantRes.status);
    return { kind: 'error' };
  }
  const grant = await grantRes.json();
  if (grant.alreadyExists) {
    return { kind: 'deduped' };
  }
  return { kind: 'ok', url: grant.url };
}

/**
 * Map a permanent-rejection response to a small outcome kind, distinguishing
 * "plan quota exhausted" (hard-stop the whole cycle) from "size/policy skip"
 * (mark this blob, move on).
 */
async function translateUploadRejection(grantRes) {
  const info = await grantRes.json().catch(() => ({}));
  console.warn('[blob-sync] upload blocked:', grantRes.status, info?.error);
  if (info?.error === 'storage_quota_exceeded') {
    return { kind: 'quota-exceeded' };
  }
  return { kind: 'skipped' };
}

/**
 * PUT a vault blob's bytes to the provider-signed URL. Distinguishes the
 * global Supabase upload limit (which the bucket cannot enforce itself) from
 * generic upload failures so we can mark the row as skipped only when retrying
 * the same bytes would burn egress for nothing.
 * @returns {Promise<'ok' | 'too-large' | 'error'>}
 */
async function performBlobPut(blob, url, localFile) {
  const putOnce = () => fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.mime || 'application/octet-stream',
      'Content-Length': String(blob.size_bytes ?? fs.statSync(localFile).size),
    },
    // Fresh stream per attempt — a retried Readable cannot be rewound.
    body: fs.createReadStream(localFile),
    duplex: 'half',
  });
  const putRes = await withTransientFetchRetry(putOnce, `put ${blob.hash.slice(0, 12)}`);
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '');
    // Supabase envuelve el "Payload too large" (límite GLOBAL de subida
    // del proyecto, aparte del límite del bucket) en un HTTP 400.
    // Sin marcarlo, cada tick re-streamearía el archivo entero para
    // volver a fallar (134 MB/min de egress desperdiciado).
    if (putRes.status === 413 || /payload too large|exceeded the maximum/i.test(detail)) {
      console.warn(
        `[blob-sync] ${blob.original_name || blob.hash.slice(0, 12)} supera el límite global de subida de Supabase Storage ` +
        '(Settings → Storage → Upload file size limit). Se reintentará al reiniciar la app.',
      );
      return 'too-large';
    }
    console.warn('[blob-sync] upload failed:', putRes.status, blob.hash.slice(0, 12), detail.slice(0, 200));
    return 'error';
  }
  return 'ok';
}

/**
 * Apply the side effects (mark uploaded/skipped, dedupe counter) that follow
 * from `requestUploadGrant` and `performBlobPut` outcomes.
 * @returns {{ kind: 'deduped' | 'skip' | 'uploaded' }}
 */
function applyUploadOutcome(blob, outcome, putResult, markUploaded, markSkipped) {
  if (outcome.kind === 'skipped' || putResult === 'too-large') {
    // Demasiado grande para el plan: marcar para no re-pedirlo cada tick
    // (se reintenta una vez por sesión de la app; ver run()).
    markSkipped.run(blob.id);
    return { kind: 'skip' };
  }
  if (outcome.kind === 'deduped' || (outcome.kind === 'ok' && putResult === 'ok')) {
    markUploaded.run(blob.id);
    return { kind: outcome.kind === 'deduped' ? 'deduped' : 'uploaded' };
  }
  return { kind: 'skip' };
}

/**
 * Outcomes from `requestUploadGrant` that must propagate up unchanged so the
 * outer loop can stop iterating (rate limit) or fail the whole cycle
 * (quota exhausted). Everything else folds through `applyUploadOutcome`.
 */
function isTerminalGrantOutcome(outcome) {
  return outcome.kind === 'rate-limited' || outcome.kind === 'quota-exceeded';
}

/**
 * Grant → PUT → side effects for one blob whose local bytes are already
 * located. Terminal grant outcomes (rate limit / quota) propagate unchanged;
 * everything else folds through `applyUploadOutcome`.
 * @returns {Promise<
 *   { kind: 'deduped' | 'uploaded' | 'skip' | 'rate-limited' | 'quota-exceeded' }
 * >}
 */
async function runBlobUpload(deps, base, blob, localFile, markUploaded, markSkipped) {
  const outcome = await requestUploadGrant(deps, base, blob);
  if (outcome.kind !== 'ok') {
    if (isTerminalGrantOutcome(outcome)) return outcome;
    return applyUploadOutcome(blob, outcome, null, markUploaded, markSkipped);
  }
  const putResult = await performBlobPut(blob, outcome.url, localFile);
  return applyUploadOutcome(blob, outcome, putResult, markUploaded, markSkipped);
}

/** Network/HTTP failure while uploading one blob — logged, never thrown. */
function logBlobUploadError(err, blob) {
  const cause = err?.cause?.code || err?.cause?.message || '';
  console.warn(
    '[blob-sync] upload error:',
    err?.message,
    cause ? `(${cause})` : '',
    blob.hash?.slice?.(0, 12) || '',
  );
}

/**
 * Try to upload one pending blob: short-circuit if the provider already has
 * it, locate the local bytes, request a grant, PUT the file, and translate
 * every failure mode into a single outcome kind.
 * @returns {Promise<
 *   { kind: 'deduped' | 'uploaded' | 'skip' | 'rate-limited' | 'quota-exceeded' }
 * >}
 */
async function uploadPendingBlob(
  deps,
  db,
  blob,
  base,
  existingSet,
  queries,
  markUploaded,
  markSkipped,
) {
  if (existingSet.has(blob.hash)) {
    markUploaded.run(blob.id);
    return { kind: 'deduped' };
  }
  const localFile = findLocalFileForHash(db, blob, queries);
  if (!localFile) return { kind: 'skip' }; // manifest row from another device — nothing to upload here

  try {
    return await runBlobUpload(deps, base, blob, localFile, markUploaded, markSkipped);
  } catch (err) {
    logBlobUploadError(err, blob);
    return { kind: 'skip' };
  }
}

/** Resolve the current file by its canonical byte hash. */
function findLocalFileForHash(db, blob, queries) {
  const byHash = db
    .prepare(
      `SELECT id, project_id, vault_path FROM resources
       WHERE COALESCE(content_hash, file_hash) = ? LIMIT 1`,
    )
    .get(blob.hash);
  if (byHash) {
    const fullPath = resolveResourceAbsPath(byHash, queries);
    if (fullPath && fs.existsSync(fullPath)) return fullPath;
  }


  return findManySessionFile(db, blob.hash);
}

/**
 * Many session bodies (conversations domain) share this pipeline. The table
 * may not exist on older installs — swallow the error.
 * @param {import('better-sqlite3').Database} db
 * @param {string} hash
 * @returns {string | null}
 */
function findManySessionFile(db, hash) {
  let session;
  try {
    session = db
      .prepare("SELECT rel_path FROM many_session_index WHERE hash = ? AND rel_path != '' LIMIT 1")
      .get(hash);
  } catch {
    /* table may not exist on older installs */
    return null;
  }
  if (!session?.rel_path) return null;
  const manySessionSync = require('./many-session-sync.cjs');
  const abs = path.join(manySessionSync.getSessionsRoot(), session.rel_path);
  return fs.existsSync(abs) ? abs : null;
}

/**
 * Resolve the vault_blobs row that backs a resource: by full `file_hash`
 * (vault files), then by the 16-char filename prefix (managed files).
 * Returns null when the manifest hasn't been pulled yet (next cycle retries).
 */
function findBlobForResource(resource, blobByHash) {
  return resource.file_hash ? blobByHash.get(resource.file_hash) : null;
}

/**
 * Stream one missing blob from the provider's signed URL into a temp file
 * then atomically rename it into place. Returns true on success, false on
 * any network/HTTP failure (caller skips that resource this cycle).
 */
async function downloadBlob(deps, base, blob, fullPath) {
  const urlRes = await domeOauth.fetchWithDomeAuth(
    deps.database,
    `${base}/api/v1/files/download-url?hash=${encodeURIComponent(blob.hash)}`,
    { method: 'GET' },
  );
  if (!urlRes.ok) return false;
  const { url } = await urlRes.json();
  const download = await fetch(url);
  if (!download.ok || !download.body) return false;
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.dome-download`;
  await pipeline(download.body, fs.createWriteStream(tmpPath));
  fs.renameSync(tmpPath, fullPath);
  return true;
}

/**
 * Attempt to download the backing blob for a single resource. Returns true on
 * a successful hydration, false when nothing was downloaded (already on disk,
 * missing manifest row, or transient network/HTTP error logged inline).
 */
async function hydrateOneResource(deps, resource, base, queries, blobByHash) {
  const fullPath = resolveResourceAbsPath(resource, queries);
  if (!fullPath || fs.existsSync(fullPath)) return false;
  const blob = findBlobForResource(resource, blobByHash);
  if (!blob) return false; // manifest not pulled yet — next cycle
  try {
    return Boolean(await downloadBlob(deps, base, blob, fullPath));
  } catch (err) {
    console.warn(
      '[blob-sync] hydrate failed for',
      resource.vault_path,
      err?.message,
    );
    return false;
  }
}

/**
 * Phase 3 — download blobs for resources whose backing file is missing
 * locally (restore on a fresh device).
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 */
async function hydrateMissingFiles(deps, db) {
  const queries = deps.database?.getQueries?.();
  const resources = db
    .prepare(
      `SELECT id, project_id, vault_path, file_hash FROM resources
       WHERE vault_path IS NOT NULL AND vault_path != '' AND type != 'folder'`,
    )
    .all();
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const blobByHash = db.prepare('SELECT * FROM vault_blobs WHERE hash = ? LIMIT 1');

  let hydrated = 0;
  for (const resource of resources) {
    if (await hydrateOneResource(deps, resource, base, queries, blobByHash)) {
      hydrated += 1;
    }
  }
  if (hydrated > 0) {
    console.log(`[blob-sync] hydrated ${hydrated} missing files`);
    deps.windowManager?.broadcast?.('resource:updated', { source: 'blob-sync' });
  }
  return hydrated;
}

/**
 * Full cycle (serialized): ingest → upload → hydrate. Called by the Domain
 * Sync scheduler after each sync tick when the `files` domain is enabled.
 * @param {{ database: object, windowManager?: object }} deps
 */
async function run(deps) {
  if (running) return { skipped: true };
  const db = deps.database?.getDB?.();
  if (!db) return { skipped: true };
  running = true;
  try {
    // Si el usuario subió el límite de Supabase/plan, el reinicio de la app
    // reintenta los saltados sin quedarse atascado en bucle dentro de la sesión.
    if (!requeuedSkippedThisSession) {
      requeuedSkippedThisSession = true;
      db.prepare("UPDATE vault_blobs SET upload_state = 'pending' WHERE upload_state = 'skipped'").run();
    }
    await ingestLocalFiles(db, deps.database.getQueries?.());
    const upload = await runUploadQueue(deps, db);
    const hydrated = await hydrateMissingFiles(deps, db);
    return { success: true, ...upload, hydrated };
  } catch (err) {
    console.warn('[blob-sync] cycle failed:', err?.message);
    return { success: false, error: err?.message };
  } finally {
    running = false;
  }
}

module.exports = {
  run,
  ingestLocalFiles,
  runUploadQueue,
  hydrateMissingFiles,
  computeFullHash,
};
