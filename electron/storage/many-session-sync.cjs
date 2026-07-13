'use strict';

/**
 * Many JSONL session sync — `conversations` domain companion (contract §3.5).
 *
 * Many chats are JSONL files under <userData>/agent-sessions/ (JsonlSessionRepo
 * owns the format; compaction/forks rewrite whole files, so per-line syncing
 * would break). Instead each session syncs as ONE versioned blob:
 *   - `many_session_index` (SQLite) is the manifest — one row per .jsonl file,
 *     id = path relative to agent-sessions/, `hash` = sha256 of the body,
 *     `updated_at` = file mtime (ms) so LWW picks the latest writer.
 *   - the body travels through the shared vault blob pipeline (blob-sync.cjs →
 *     dome-vault bucket) via a `vault_blobs` ledger row per body hash.
 *   - restore: manifest rows whose file is missing locally are downloaded back
 *     to agent-sessions/<rel_path>.
 *
 * Debounce: refresh runs on the 60 s scheduler tick and skips unchanged files
 * by (size, mtime) — a session is only re-hashed/re-uploaded after it stops
 * changing between ticks.
 */
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');

function getUserDataPath() {
  try {
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    return path.join(os.homedir(), '.dome');
  }
}

function getSessionsRoot() {
  return path.join(getUserDataPath(), 'agent-sessions');
}

/** @returns {string[]} paths of .jsonl files relative to the sessions root */
function listSessionFiles(root) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(path.relative(root, abs));
      }
    }
  };
  try {
    walk(root);
  } catch (err) {
    console.warn('[many-session-sync] listing failed:', err?.message);
  }
  return out;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

/**
 * Bring many_session_index in line with the files on disk. Unchanged files
 * (same size + mtime) are skipped; deleted files drop their manifest row
 * (the AFTER DELETE trigger records the tombstone). Each (re)hashed body is
 * enqueued in vault_blobs for upload; a superseded body's ledger row is
 * removed so it stops occupying the upload queue.
 * @param {import('better-sqlite3').Database} db
 */
async function refreshManifest(db) {
  const root = getSessionsRoot();
  const files = listSessionFiles(root);
  const known = new Map(
    db.prepare('SELECT * FROM many_session_index').all().map((r) => [r.id, r]),
  );
  const upsertManifest = db.prepare(`
    INSERT INTO many_session_index (id, title, agent_id, rel_path, hash, size_bytes, created_at, updated_at)
    VALUES (?, NULL, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      rel_path = excluded.rel_path,
      hash = excluded.hash,
      size_bytes = excluded.size_bytes,
      updated_at = excluded.updated_at
  `);
  const enqueueBody = db.prepare(`
    INSERT OR IGNORE INTO vault_blobs
      (id, hash, size_bytes, mime, original_name, upload_state, local_state, created_at, updated_at)
    VALUES (?, ?, ?, 'application/x-ndjson', ?, 'pending', 'present', ?, ?)
  `);
  const dropOldBody = db.prepare('DELETE FROM vault_blobs WHERE hash = ?');

  let changed = 0;
  for (const rel of files) {
    const abs = path.join(root, rel);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    const mtimeMs = Math.floor(stat.mtimeMs);
    const existing = known.get(rel);
    known.delete(rel);
    if (existing && existing.updated_at === mtimeMs && existing.size_bytes === stat.size) continue;

    try {
      const hash = await sha256File(abs);
      if (existing && existing.hash && existing.hash !== hash) {
        dropOldBody.run(existing.hash); // superseded version — stop uploading it
      }
      const now = Date.now();
      upsertManifest.run(rel, rel, hash, stat.size, existing?.created_at ?? now, mtimeMs);
      enqueueBody.run(crypto.randomUUID(), hash, stat.size, path.basename(rel), now, now);
      changed += 1;
    } catch (err) {
      console.warn('[many-session-sync] hash failed for', rel, err?.message);
    }
  }

  // Files gone from disk → manifest rows out (tombstone via trigger).
  const removeManifest = db.prepare('DELETE FROM many_session_index WHERE id = ?');
  for (const [id, row] of known) {
    removeManifest.run(id);
    if (row.hash) dropOldBody.run(row.hash);
  }

  if (changed > 0 || known.size > 0) {
    console.log(`[many-session-sync] manifest: ${changed} updated, ${known.size} removed`);
  }
  return { changed, removed: known.size };
}

/**
 * Download session bodies present in the manifest but missing on disk
 * (fresh-device restore). Bodies come from the dome-vault bucket by hash.
 * @param {{ database: object, windowManager?: object }} deps
 * @param {import('better-sqlite3').Database} db
 */
async function restoreMissingSessions(deps, db) {
  const root = getSessionsRoot();
  const rows = db
    .prepare("SELECT * FROM many_session_index WHERE rel_path != '' AND hash != ''")
    .all();
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');

  let restored = 0;
  for (const row of rows) {
    const abs = path.join(root, row.rel_path);
    if (fs.existsSync(abs)) {
      // LWW at file level: replace only when the remote body is strictly newer.
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (Math.floor(stat.mtimeMs) >= row.updated_at) continue;
    }
    try {
      const urlRes = await domeOauth.fetchWithDomeAuth(
        deps.database,
        `${base}/api/v1/files/download-url?hash=${encodeURIComponent(row.hash)}`,
        { method: 'GET' },
      );
      if (!urlRes.ok) continue; // body not uploaded yet by the other device
      const { url } = await urlRes.json();
      const download = await fetch(url);
      if (!download.ok || !download.body) continue;

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = `${abs}.dome-download`;
      await pipeline(download.body, fs.createWriteStream(tmp));
      fs.renameSync(tmp, abs);
      try {
        fs.utimesSync(abs, new Date(row.updated_at), new Date(row.updated_at));
      } catch {
        /* best effort — keeps LWW stable across restarts */
      }
      restored += 1;
    } catch (err) {
      console.warn('[many-session-sync] restore failed for', row.rel_path, err?.message);
    }
  }
  if (restored > 0) {
    console.log(`[many-session-sync] restored ${restored} session bodies`);
    deps.windowManager?.broadcast?.('domain-sync:completed', {
      domain: 'conversations',
      restored,
    });
  }
  return restored;
}

module.exports = {
  refreshManifest,
  restoreMissingSessions,
  getSessionsRoot,
  listSessionFiles,
};
