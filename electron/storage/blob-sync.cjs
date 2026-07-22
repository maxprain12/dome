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
 *                          the vault at their original internal_path.
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
 * internal_path → full hash, computed this session. Prevents re-hashing files
 * whose filename prefix does not match their current sha256 (e.g. files edited
 * after import) on every tick.
 * @type {Map<string, string>}
 */
const hashCache = new Map();

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

/**
 * @param {string} internalPath e.g. `documents/ab12cd34ef56ab78.pdf`
 * @returns {string} the 16-char local hash prefix embedded in the filename
 */
function prefixFromInternalPath(internalPath) {
  const base = path.basename(String(internalPath));
  const stem = base.includes('.') ? base.slice(0, base.indexOf('.')) : base;
  return /^[0-9a-f]{16}$/.test(stem) ? stem : '';
}

/**
 * Absolute on-disk path for a resource's backing file, covering both storage
 * schemes: vault (`vault_path`, relative to the project vault root — the
 * common case) and managed storage (`internal_path`).
 * @param {object} resource
 * @param {object} queries
 * @returns {string | null}
 */
function resolveResourceAbsPath(resource, queries) {
  try {
    const primary = vaultStore.getResourceFilePath(resource, queries, fileStorage);
    if (primary && fs.existsSync(primary)) return primary;
    // Recursos con ambos esquemas: si la copia del vault falta, usar la gestionada.
    if (resource.internal_path) {
      const managed = fileStorage.getFullPath(resource.internal_path);
      if (managed && fs.existsSync(managed)) return managed;
    }
    return primary;
  } catch {
    return null;
  }
}

/**
 * Phase 1 — make sure every local resource file has a manifest row.
 * Covers BOTH storage schemes: `internal_path` (managed) and `vault_path`
 * (vault files — the vast majority; historically these were skipped, so the
 * cloud manifest only ever saw a handful of blobs and Companion showed
 * "not synced" for everything else).
 * @param {import('better-sqlite3').Database} db
 * @param {object} [queries]
 */
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
  const syncTombstone = require('./sync-tombstone.cjs');
  const findByHash = db.prepare('SELECT id FROM vault_blobs WHERE hash = ? AND id != ? LIMIT 1');
  const update = db.prepare('UPDATE vault_blobs SET hash = ?, updated_at = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM vault_blobs WHERE id = ?');
  // El tombstone limpia la copia mala que ya viajó al manifiesto cloud.
  const drop = (id) => {
    remove.run(id);
    syncTombstone.recordTombstone(db, 'vault_blobs', id);
  };
  for (const row of bad) {
    const resource = db
      .prepare(
        `SELECT id, project_id, internal_path, vault_path, file_path FROM resources
         WHERE file_hash = ? OR file_hash LIKE ? || '%' LIMIT 1`,
      )
      .get(row.hash, row.hash);
    const fullPath = resource ? resolveResourceAbsPath(resource, queries) : null;
    if (fullPath && fs.existsSync(fullPath)) {
      try {
        const fullHash = await computeFullHash(fullPath);
        if (findByHash.get(fullHash, row.id)) {
          // El ingest ya creó la fila buena para este archivo: la mala sobra.
          drop(row.id);
          console.log(`[blob-sync] dropped duplicate bad-hash row ${row.hash}`);
        } else {
          update.run(fullHash, Date.now(), row.id);
          console.log(`[blob-sync] repaired manifest hash ${row.hash} → ${fullHash.slice(0, 12)}…`);
        }
        continue;
      } catch (err) {
        console.warn('[blob-sync] hash repair failed:', err?.message);
      }
    }
    drop(row.id);
  }
}

/**
 * Fast in-memory + manifest-row dedupe before touching the disk: filename
 * prefix (managed files), known file_hash (vault files), or already hashed
 * this session.
 * @returns {boolean}
 */
function isFastDeduped(resource, cacheKey, findByPrefix, findByHash) {
  const prefix = resource.internal_path ? prefixFromInternalPath(resource.internal_path) : '';
  if (prefix && findByPrefix.get(prefix)) return true;
  if (resource.file_hash && findByHash.get(resource.file_hash)) return true;
  return hashCache.has(cacheKey);
}

/**
 * Backfill a legacy `file_hash` (16-char prefix) with the full sha256 so
 * Companion can find the blob by file_hash on the wire. The bump on
 * `updated_at` re-pushes the resource row through the `library` domain.
 */
function backfillLegacyFileHash(db, resource, hash) {
  try {
    db.prepare('UPDATE resources SET file_hash = ?, updated_at = ? WHERE id = ?')
      .run(hash, Date.now(), resource.id);
  } catch (err) {
    console.warn('[blob-sync] file_hash backfill failed:', err?.message);
  }
}

/**
 * Hash (or trust) one resource, write the `vault_blobs` manifest row, and
 * handle the legacy file_hash backfill. Returns whether a new row was
 * inserted (used by `ingestLocalFiles` to bump its counter).
 * @returns {Promise<boolean>}
 */
async function ingestOneResource(resource, cacheKey, fullPath, db, findByHash, insert) {
  try {
    const { trustedHash, hash } = await resolveResourceHash(resource, fullPath);
    hashCache.set(cacheKey, hash);
    pathByHash.set(hash, fullPath);
    maybeBackfillLegacyFileHash(db, resource, hash, trustedHash);
    if (findByHash.get(hash)) return false;
    return insertManifestRow(insert, resource, fullPath, hash);
  } catch (err) {
    console.warn('[blob-sync] ingest failed for', cacheKey, err?.message);
    return false;
  }
}

/**
 * Resolve the hash for one resource: trust `resource.file_hash` when it is
 * a full sha256 (the vault-watcher keeps it in sync and Companion looks up
 * the blob by it on the wire), otherwise stream the file and compute the
 * full sha256. Legacy 16-char prefixes are NOT trusted — the provider
 * rejects the entire batch on a single non-64-hex hash.
 */
async function resolveResourceHash(resource, fullPath) {
  const trustedHash = FULL_HASH_RE.test(String(resource.file_hash || '')) ? resource.file_hash : null;
  const hash = trustedHash || (await computeFullHash(fullPath));
  return { trustedHash, hash };
}

/**
 * Backfill a legacy `file_hash` (16-char prefix) with the full sha256 so
 * Companion can find the blob by file_hash on the wire. Skipped when the
 * existing file_hash is already a full sha256 (`!trustedHash`) or already
 * matches the just-computed hash.
 */
function maybeBackfillLegacyFileHash(db, resource, hash, trustedHash) {
  if (!trustedHash && resource.file_hash && resource.file_hash !== hash) {
    backfillLegacyFileHash(db, resource, hash);
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

async function ingestLocalFiles(db, queries) {
  await repairInvalidManifestHashes(db, queries);
  const resources = db
    .prepare(
      `SELECT id, project_id, internal_path, vault_path, file_hash, file_mime_type, original_filename
       FROM resources
       WHERE (internal_path IS NOT NULL AND internal_path != '')
          OR (vault_path IS NOT NULL AND vault_path != '' AND type != 'folder')`,
    )
    .all();
  const findByPrefix = db.prepare("SELECT id FROM vault_blobs WHERE hash LIKE ? || '%' LIMIT 1");
  const findByHash = db.prepare('SELECT id FROM vault_blobs WHERE hash = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vault_blobs
      (id, hash, size_bytes, mime, original_name, upload_state, local_state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 'present', ?, ?)
  `);

  let ingested = 0;
  for (const resource of resources) {
    const cacheKey = resource.vault_path
      ? `${resource.project_id}:${resource.vault_path}`
      : resource.internal_path;
    if (isFastDeduped(resource, cacheKey, findByPrefix, findByHash)) continue;
    const fullPath = resolveResourceAbsPath(resource, queries);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    if (await ingestOneResource(resource, cacheKey, fullPath, db, findByHash, insert)) {
      ingested += 1;
    }
  }
  if (ingested > 0) console.log(`[blob-sync] ingested ${ingested} new vault blobs`);
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
 * missing local paths by content-hashing the vault, then upload each blob.
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

  // Resolver por contenido los hashes sin mapeo directo (espejos .md/.html)
  // ANTES del bucle: una sola pasada por el vault cubre todo el batch.
  const unresolved = new Set(
    batch
      .filter((b) => !existingSet.has(b.hash) && !findLocalFileForHash(db, b, queries))
      .map((b) => b.hash),
  );
  if (unresolved.size) {
    await scanVaultForHashes(db, queries, unresolved);
  }

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
  const pending = rows.filter((b) => FULL_HASH_RE.test(String(b.hash || '')));
  if (pending.length < rows.length) {
    console.warn(`[blob-sync] skipping ${rows.length - pending.length} manifest rows with invalid hash`);
  }
  if (!pending.length) return { uploaded: 0, deduped: 0 };

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
 * Request a signed upload URL for one blob and translate provider response
 * codes into a small outcome enum the caller can branch on.
 * @returns {Promise<
 *   { kind: 'ok', url: string }
 * | { kind: 'rate-limited' | 'quota-exceeded' | 'skipped' | 'error' | 'deduped' }
 * >}
 */
async function requestUploadGrant(deps, base, blob) {
  const grantRes = await domeOauth.fetchWithDomeAuth(
    deps.database,
    `${base}/api/v1/files/upload-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: blob.hash, sizeBytes: blob.size_bytes, mime: blob.mime }),
    },
  );
  if (grantRes.status === 429) {
    return { kind: 'rate-limited' };
  }
  if (grantRes.status === 413 || grantRes.status === 402 || grantRes.status === 403) {
    const info = await grantRes.json().catch(() => ({}));
    console.warn('[blob-sync] upload blocked:', grantRes.status, info?.error);
    if (info?.error === 'storage_quota_exceeded') {
      return { kind: 'quota-exceeded' };
    }
    return { kind: 'skipped' };
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
 * PUT a vault blob's bytes to the provider-signed URL. Distinguishes the
 * global Supabase upload limit (which the bucket cannot enforce itself) from
 * generic upload failures so we can mark the row as skipped only when retrying
 * the same bytes would burn egress for nothing.
 * @returns {Promise<'ok' | 'too-large' | 'error'>}
 */
async function performBlobPut(blob, url, localFile) {
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.mime || 'application/octet-stream',
      'Content-Length': String(blob.size_bytes ?? fs.statSync(localFile).size),
    },
    body: fs.createReadStream(localFile),
    duplex: 'half',
  });
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
    const outcome = await requestUploadGrant(deps, base, blob);
    if (outcome.kind !== 'ok') {
      if (outcome.kind === 'rate-limited' || outcome.kind === 'quota-exceeded') return outcome;
      return applyUploadOutcome(blob, outcome, null, markUploaded, markSkipped);
    }
    const putResult = await performBlobPut(blob, outcome.url, localFile);
    return applyUploadOutcome(blob, outcome, putResult, markUploaded, markSkipped);
  } catch (err) {
    console.warn('[blob-sync] upload error:', err?.message);
    return { kind: 'skip' };
  }
}

/** hash completo → ruta absoluta local, poblado por ingest y por el escaneo perezoso. */
const pathByHash = new Map();

/**
 * Última vía: recorre los archivos del vault hasheándolos (con caché) para
 * mapear hash→ruta. Necesario para recursos SIN `file_hash` (espejos de notas
 * y artefactos .md/.html): su fila del manifiesto nace de un hash calculado,
 * imposible de resolver por columnas. Una pasada cubre todos los pendientes.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [queries]
 * @param {Set<string>} wantedHashes
 */
async function scanVaultForHashes(db, queries, wantedHashes) {
  if (!wantedHashes.size) return;
  const resources = db
    .prepare(
      `SELECT id, project_id, internal_path, vault_path, file_path FROM resources
       WHERE vault_path IS NOT NULL AND vault_path != '' AND type != 'folder'`,
    )
    .all();
  for (const resource of resources) {
    if (!wantedHashes.size) return;
    const cacheKey = `${resource.project_id}:${resource.vault_path}`;
    let hash = hashCache.get(cacheKey);
    const fullPath = resolveResourceAbsPath(resource, queries);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    if (!hash) {
      try {
        hash = await computeFullHash(fullPath);
        hashCache.set(cacheKey, hash);
      } catch {
        continue;
      }
    }
    pathByHash.set(hash, fullPath);
    wantedHashes.delete(hash);
  }
}

/**
 * Locate the local file whose content matches a manifest row: by exact
 * `file_hash` (vault files), by the 16-char filename prefix (managed files),
 * or a Many session body sharing this pipeline.
 * @param {import('better-sqlite3').Database} db
 * @param {{ hash: string }} blob
 * @param {object} [queries]
 * @returns {string | null} absolute path
 */
function findLocalFileForHash(db, blob, queries) {
  const known = pathByHash.get(blob.hash);
  if (known && fs.existsSync(known)) return known;

  const byHash = db
    .prepare(
      `SELECT id, project_id, internal_path, vault_path, file_path FROM resources
       WHERE file_hash = ? LIMIT 1`,
    )
    .get(blob.hash);
  if (byHash) {
    const fullPath = resolveResourceAbsPath(byHash, queries);
    if (fullPath && fs.existsSync(fullPath)) return fullPath;
  }

  const prefixPath = findResourceByPrefixPath(db, blob.hash);
  if (prefixPath) return prefixPath;

  return findManySessionFile(db, blob.hash);
}

/**
 * Locate a managed resource's backing file via the 16-char sha256 prefix
 * embedded in its filename. Returns the absolute path of an existing file
 * or null when no row matches or the file is missing on disk.
 * @param {import('better-sqlite3').Database} db
 * @param {string} hash
 * @returns {string | null}
 */
function findResourceByPrefixPath(db, hash) {
  const prefix = hash.slice(0, 16);
  const row = db
    .prepare(
      `SELECT internal_path FROM resources
       WHERE internal_path IS NOT NULL AND internal_path LIKE '%' || ? || '%' LIMIT 1`,
    )
    .get(prefix);
  if (!row?.internal_path) return null;
  const fullPath = fileStorage.getFullPath(row.internal_path);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
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
function findBlobForResource(resource, blobByPrefix, blobByHash) {
  const byHash = resource.file_hash ? blobByHash.get(resource.file_hash) : null;
  if (byHash || !resource.internal_path) return byHash;
  const prefix = prefixFromInternalPath(resource.internal_path);
  return prefix ? blobByPrefix.get(prefix) : null;
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
async function hydrateOneResource(deps, resource, base, queries, blobByPrefix, blobByHash) {
  const fullPath = resolveResourceAbsPath(resource, queries);
  if (!fullPath || fs.existsSync(fullPath)) return false;
  const blob = findBlobForResource(resource, blobByPrefix, blobByHash);
  if (!blob) return false; // manifest not pulled yet — next cycle
  try {
    return Boolean(await downloadBlob(deps, base, blob, fullPath));
  } catch (err) {
    console.warn(
      '[blob-sync] hydrate failed for',
      resource.vault_path || resource.internal_path,
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
      `SELECT id, project_id, internal_path, vault_path, file_hash FROM resources
       WHERE (internal_path IS NOT NULL AND internal_path != '')
          OR (vault_path IS NOT NULL AND vault_path != '' AND type != 'folder')`,
    )
    .all();
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const blobByPrefix = db.prepare("SELECT * FROM vault_blobs WHERE hash LIKE ? || '%' LIMIT 1");
  const blobByHash = db.prepare('SELECT * FROM vault_blobs WHERE hash = ? LIMIT 1');

  let hydrated = 0;
  for (const resource of resources) {
    if (await hydrateOneResource(deps, resource, base, queries, blobByPrefix, blobByHash)) {
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
  prefixFromInternalPath,
};
