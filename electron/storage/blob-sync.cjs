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
    // Fast dedupe without touching the disk: filename prefix (managed files),
    // known file_hash (vault files), or already hashed this session.
    const prefix = resource.internal_path ? prefixFromInternalPath(resource.internal_path) : '';
    if (prefix && findByPrefix.get(prefix)) continue;
    if (resource.file_hash && findByHash.get(resource.file_hash)) continue;
    if (hashCache.has(cacheKey)) continue;

    const fullPath = resolveResourceAbsPath(resource, queries);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    try {
      // file_hash lo mantiene el vault-watcher y es lo que viaja en el wire
      // (Companion busca el blob por él); solo es de fiar si es un sha256
      // completo — los recursos legacy guardan un prefijo de 16 y el provider
      // rechaza el batch entero si un hash no es de 64 hex.
      const trustedHash = FULL_HASH_RE.test(String(resource.file_hash || '')) ? resource.file_hash : null;
      const hash = trustedHash || (await computeFullHash(fullPath));
      hashCache.set(cacheKey, hash);
      pathByHash.set(hash, fullPath);
      // Backfill: un file_hash legacy (16 chars, esquema antiguo) puede NO ser
      // prefijo del sha256 real — Companion busca el blob por file_hash, así
      // que sin corregirlo el recurso queda "no sincronizado" en el móvil.
      // El bump de updated_at re-empuja la fila por el dominio library.
      if (!trustedHash && resource.file_hash && resource.file_hash !== hash) {
        try {
          db.prepare('UPDATE resources SET file_hash = ?, updated_at = ? WHERE id = ?')
            .run(hash, Date.now(), resource.id);
        } catch (err) {
          console.warn('[blob-sync] file_hash backfill failed:', err?.message);
        }
      }
      if (findByHash.get(hash)) continue;
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
      if (result.changes > 0) ingested += 1;
    } catch (err) {
      console.warn('[blob-sync] ingest failed for', cacheKey, err?.message);
    }
  }
  if (ingested > 0) console.log(`[blob-sync] ingested ${ingested} new vault blobs`);
  return ingested;
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
    const statRes = await domeOauth.fetchWithDomeAuth(deps.database, `${base}/api/v1/files/stat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: batch.map((b) => b.hash) }),
    });
    if (!statRes.ok) {
      console.warn('[blob-sync] stat failed:', statRes.status);
      return { uploaded, deduped, error: `stat_${statRes.status}` };
    }
    const { existing } = await statRes.json();
    const existingSet = new Set(existing || []);

    // Resolver por contenido los hashes sin mapeo directo (espejos .md/.html)
    // ANTES del bucle: una sola pasada por el vault cubre todo el batch.
    const unresolved = new Set(
      batch
        .filter((b) => !existingSet.has(b.hash) && !findLocalFileForHash(db, b, deps.database.getQueries?.()))
        .map((b) => b.hash),
    );
    if (unresolved.size) {
      await scanVaultForHashes(db, deps.database.getQueries?.(), unresolved);
    }

    for (const blob of batch) {
      if (existingSet.has(blob.hash)) {
        markUploaded.run(blob.id);
        deduped += 1;
        continue;
      }
      const localFile = findLocalFileForHash(db, blob, deps.database.getQueries?.());
      if (!localFile) continue; // manifest row from another device — nothing to upload here

      try {
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
          // Rate limit del provider (30 req/min): los pendientes siguen en
          // cola y el siguiente tick (60 s) continúa con cupo fresco.
          console.warn(`[blob-sync] upload-url rate-limited — ${uploaded} uploaded, resuming next tick`);
          return { uploaded, deduped, rateLimited: true };
        }
        if (grantRes.status === 413 || grantRes.status === 402 || grantRes.status === 403) {
          const info = await grantRes.json().catch(() => ({}));
          console.warn('[blob-sync] upload blocked:', grantRes.status, info?.error);
          if (info?.error === 'storage_quota_exceeded') {
            return { uploaded, deduped, error: 'storage_quota_exceeded' };
          }
          // Demasiado grande para el plan: marcar para no re-pedirlo cada tick
          // (se reintenta una vez por sesión de la app; ver run()).
          markSkipped.run(blob.id);
          continue;
        }
        if (!grantRes.ok) {
          console.warn('[blob-sync] upload-url failed:', grantRes.status);
          continue;
        }
        const grant = await grantRes.json();
        if (grant.alreadyExists) {
          markUploaded.run(blob.id);
          deduped += 1;
          continue;
        }

        const putRes = await fetch(grant.url, {
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
            markSkipped.run(blob.id);
            continue;
          }
          console.warn('[blob-sync] upload failed:', putRes.status, blob.hash.slice(0, 12), detail.slice(0, 200));
          continue;
        }
        markUploaded.run(blob.id);
        uploaded += 1;
      } catch (err) {
        console.warn('[blob-sync] upload error:', err?.message);
      }
    }
  }
  if (uploaded || deduped) {
    console.log(`[blob-sync] uploads done: ${uploaded} uploaded, ${deduped} deduped`);
  }
  return { uploaded, deduped };
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

  const prefix = blob.hash.slice(0, 16);
  const row = db
    .prepare(
      `SELECT internal_path FROM resources
       WHERE internal_path IS NOT NULL AND internal_path LIKE '%' || ? || '%' LIMIT 1`,
    )
    .get(prefix);
  if (row?.internal_path) {
    const fullPath = fileStorage.getFullPath(row.internal_path);
    if (fullPath && fs.existsSync(fullPath)) return fullPath;
  }

  // Many session bodies (conversations domain) share this pipeline.
  try {
    const session = db
      .prepare("SELECT rel_path FROM many_session_index WHERE hash = ? AND rel_path != '' LIMIT 1")
      .get(blob.hash);
    if (session?.rel_path) {
      const manySessionSync = require('./many-session-sync.cjs');
      const abs = path.join(manySessionSync.getSessionsRoot(), session.rel_path);
      if (fs.existsSync(abs)) return abs;
    }
  } catch {
    /* table may not exist on older installs */
  }
  return null;
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
    const fullPath = resolveResourceAbsPath(resource, queries);
    if (!fullPath || fs.existsSync(fullPath)) continue;
    let blob = resource.file_hash ? blobByHash.get(resource.file_hash) : null;
    if (!blob && resource.internal_path) {
      const prefix = prefixFromInternalPath(resource.internal_path);
      if (prefix) blob = blobByPrefix.get(prefix);
    }
    if (!blob) continue; // manifest not pulled yet — next cycle

    try {
      const urlRes = await domeOauth.fetchWithDomeAuth(
        deps.database,
        `${base}/api/v1/files/download-url?hash=${encodeURIComponent(blob.hash)}`,
        { method: 'GET' },
      );
      if (!urlRes.ok) continue;
      const { url } = await urlRes.json();
      const download = await fetch(url);
      if (!download.ok || !download.body) continue;

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const tmpPath = `${fullPath}.dome-download`;
      await pipeline(download.body, fs.createWriteStream(tmpPath));
      fs.renameSync(tmpPath, fullPath);
      hydrated += 1;
    } catch (err) {
      console.warn(
        '[blob-sync] hydrate failed for',
        resource.vault_path || resource.internal_path,
        err?.message,
      );
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
