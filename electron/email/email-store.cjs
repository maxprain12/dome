'use strict';

/**
 * Local SQLite store for synced email envelopes / bodies (plan 004).
 */

const crypto = require('crypto');
const database = require('../core/database.cjs');
const { secureTimestampId } = require('../core/secure-id.cjs');

const db = () => database.getDB();
const now = () => Date.now();

function folderIdFor(accountId, remoteName) {
  const hash = crypto.createHash('sha1').update(`${accountId}:${remoteName}`).digest('hex').slice(0, 12);
  return `efldr-${hash}`;
}

function messageRowId(accountId, folderId, uid) {
  const hash = crypto
    .createHash('sha1')
    .update(`${accountId}:${folderId}:${uid}`)
    .digest('hex')
    .slice(0, 16);
  return `emsg-${hash}`;
}

function syncStateId(accountId, folderId) {
  return `esync-${crypto.createHash('sha1').update(`${accountId}:${folderId}`).digest('hex').slice(0, 12)}`;
}

function inferFolderRole(remoteName) {
  const n = String(remoteName || '').toUpperCase();
  if (n === 'INBOX') return 'inbox';
  if (n === 'SENT' || n.includes('SENT')) return 'sent';
  if (n === 'DRAFTS' || n.includes('DRAFT')) return 'drafts';
  if (n === 'TRASH' || n.includes('TRASH') || n.includes('BIN')) return 'trash';
  return null;
}

function upsertFolder(accountId, remoteName, { role, uidvalidity } = {}) {
  const id = folderIdFor(accountId, remoteName);
  const ts = now();
  const resolvedRole = role ?? inferFolderRole(remoteName);
  db()
    .prepare(
      `INSERT INTO email_folders (id, account_id, remote_name, role, uidvalidity, created_at, updated_at)
       VALUES (@id, @account_id, @remote_name, @role, @uidvalidity, @ts, @ts)
       ON CONFLICT(account_id, remote_name) DO UPDATE SET
         role = COALESCE(excluded.role, email_folders.role),
         uidvalidity = COALESCE(excluded.uidvalidity, email_folders.uidvalidity),
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      account_id: accountId,
      remote_name: remoteName,
      role: resolvedRole,
      uidvalidity: uidvalidity ?? null,
      ts,
    });
  return db().prepare('SELECT * FROM email_folders WHERE id = ?').get(id);
}

function getFolderByRemote(accountId, remoteName) {
  return db()
    .prepare('SELECT * FROM email_folders WHERE account_id = ? AND remote_name = ?')
    .get(accountId, remoteName);
}

function listFolders(accountId) {
  return db()
    .prepare('SELECT * FROM email_folders WHERE account_id = ? ORDER BY remote_name')
    .all(accountId);
}

function parseAddrList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  if (typeof value === 'string') return [{ addr: value }];
  return [];
}

/** Himalaya JSON uses `{ name, email }[]`; Dome UI expects `{ name, addr }`. */
function normalizeAddrField(value) {
  const list = parseAddrList(value)
    .map((a) => {
      if (typeof a === 'string') return { name: null, addr: a };
      if (!a || typeof a !== 'object') return null;
      const addr = a.addr || a.email || null;
      if (!addr && !a.name) return null;
      return { name: a.name || null, addr: addr || null };
    })
    .filter(Boolean);
  if (list.length === 0) return null;
  return list.length === 1 ? list[0] : list;
}

function normalizeFlags(flags) {
  if (flags == null) return null;
  if (!Array.isArray(flags)) return flags;
  return flags.map((f) => {
    if (typeof f === 'string') return f;
    if (f && typeof f === 'object') return f.iana || f.raw || '';
    return '';
  }).filter(Boolean);
}

function envelopeToFields(env) {
  const uid = String(env?.id ?? env?.uid ?? env?.message_id ?? env?.['message-id'] ?? '');
  const dateRaw = env?.date || env?.internal_date || null;
  let dateMs = null;
  if (dateRaw != null) {
    const t = Date.parse(dateRaw);
    dateMs = Number.isFinite(t) ? t : null;
    if (dateMs == null && typeof dateRaw === 'number') dateMs = dateRaw;
  }
  const from = normalizeAddrField(env?.from);
  const to = normalizeAddrField(env?.to);
  const cc = normalizeAddrField(env?.cc);
  const flags = normalizeFlags(env?.flags ?? env?.flag);
  return {
    uid,
    messageId: env?.message_id || env?.messageId || env?.['message-id'] || null,
    subject: env?.subject ?? null,
    fromJson: JSON.stringify(from),
    toJson: JSON.stringify(to),
    ccJson: JSON.stringify(cc),
    dateMs,
    snippet: env?.preview || env?.snippet || env?.subject || null,
    hasAttachments:
      env?.has_attachment || env?.has_attachments || env?.['has-attachment'] ? 1 : 0,
    flagsJson: JSON.stringify(flags),
  };
}

function upsertEnvelope(accountId, folderId, env) {
  const fields = envelopeToFields(env);
  if (!fields.uid) return null;
  const id = messageRowId(accountId, folderId, fields.uid);
  const ts = now();
  const existing = db().prepare('SELECT body_text, body_html FROM email_messages WHERE id = ?').get(id);
  db()
    .prepare(
      `INSERT INTO email_messages (
         id, account_id, folder_id, uid, message_id, subject,
         from_json, to_json, cc_json, date_ms, snippet, has_attachments, flags_json,
         body_text, body_html, synced_at, created_at, updated_at
       ) VALUES (
         @id, @account_id, @folder_id, @uid, @message_id, @subject,
         @from_json, @to_json, @cc_json, @date_ms, @snippet, @has_attachments, @flags_json,
         @body_text, @body_html, @ts, @ts, @ts
       )
       ON CONFLICT(account_id, folder_id, uid) DO UPDATE SET
         message_id = COALESCE(excluded.message_id, email_messages.message_id),
         subject = COALESCE(excluded.subject, email_messages.subject),
         from_json = CASE
           WHEN excluded.from_json IS NULL OR excluded.from_json = 'null' THEN email_messages.from_json
           ELSE excluded.from_json
         END,
         to_json = CASE
           WHEN excluded.to_json IS NULL OR excluded.to_json = 'null' THEN email_messages.to_json
           ELSE excluded.to_json
         END,
         cc_json = CASE
           WHEN excluded.cc_json IS NULL OR excluded.cc_json = 'null' THEN email_messages.cc_json
           ELSE excluded.cc_json
         END,
         date_ms = COALESCE(excluded.date_ms, email_messages.date_ms),
         snippet = COALESCE(excluded.snippet, email_messages.snippet),
         has_attachments = excluded.has_attachments,
         flags_json = CASE
           WHEN excluded.flags_json IS NULL OR excluded.flags_json = 'null' THEN email_messages.flags_json
           ELSE excluded.flags_json
         END,
         synced_at = excluded.synced_at,
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      account_id: accountId,
      folder_id: folderId,
      uid: fields.uid,
      message_id: fields.messageId,
      subject: fields.subject,
      from_json: fields.fromJson,
      to_json: fields.toJson,
      cc_json: fields.ccJson,
      date_ms: fields.dateMs,
      snippet: fields.snippet,
      has_attachments: fields.hasAttachments,
      flags_json: fields.flagsJson,
      body_text: existing?.body_text ?? null,
      body_html: existing?.body_html ?? null,
      ts,
    });
  return id;
}

function mapMessageRow(row) {
  if (!row) return null;
  let from = null;
  let to = null;
  let cc = null;
  let flags = null;
  try {
    from = row.from_json ? JSON.parse(row.from_json) : null;
  } catch {
    from = null;
  }
  try {
    to = row.to_json ? JSON.parse(row.to_json) : null;
  } catch {
    to = null;
  }
  try {
    cc = row.cc_json ? JSON.parse(row.cc_json) : null;
  } catch {
    cc = null;
  }
  try {
    flags = row.flags_json ? JSON.parse(row.flags_json) : null;
  } catch {
    flags = null;
  }
  // Re-normalize legacy rows that stored Himalaya `{ email }` / arrays as-is.
  from = normalizeAddrField(from);
  to = normalizeAddrField(to);
  cc = normalizeAddrField(cc);
  flags = normalizeFlags(flags);
  return {
    id: row.uid,
    dbId: row.id,
    subject: row.subject,
    from,
    to,
    cc,
    date: row.date_ms != null ? new Date(row.date_ms).toISOString() : null,
    flags,
    snippet: row.snippet,
    has_attachments: Boolean(row.has_attachments),
    message_id: row.message_id,
    folderId: row.folder_id,
    accountId: row.account_id,
    body_text: row.body_text ?? null,
    body_html: row.body_html ?? null,
    synced_at: row.synced_at,
  };
}

/** Normalize a live Himalaya envelope for the renderer (same shape as cache). */
function normalizeEnvelope(env) {
  if (!env || typeof env !== 'object') return null;
  const fields = envelopeToFields(env);
  if (!fields.uid) return null;
  let flags = null;
  try {
    flags = fields.flagsJson ? JSON.parse(fields.flagsJson) : null;
  } catch {
    flags = null;
  }
  let from = null;
  let to = null;
  let cc = null;
  try {
    from = JSON.parse(fields.fromJson);
  } catch {
    from = null;
  }
  try {
    to = JSON.parse(fields.toJson);
  } catch {
    to = null;
  }
  try {
    cc = JSON.parse(fields.ccJson);
  } catch {
    cc = null;
  }
  return {
    id: fields.uid,
    subject: fields.subject,
    from,
    to,
    cc,
    date: fields.dateMs != null ? new Date(fields.dateMs).toISOString() : env.date || null,
    flags,
    snippet: fields.snippet,
    has_attachments: Boolean(fields.hasAttachments),
    message_id: fields.messageId,
  };
}

function listCachedEnvelopes(accountId, folderRemoteName, { limit = 200, offset = 0 } = {}) {
  const folder = getFolderByRemote(accountId, folderRemoteName);
  if (!folder) return [];
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const rows = db()
    .prepare(
      `SELECT * FROM email_messages
       WHERE account_id = ? AND folder_id = ?
       ORDER BY COALESCE(date_ms, 0) DESC, synced_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(accountId, folder.id, cap, off);
  return rows.map(mapMessageRow);
}

function getCachedMessage(accountId, uid, folderRemoteName) {
  const folder = getFolderByRemote(accountId, folderRemoteName);
  if (!folder) return null;
  const row = db()
    .prepare(
      `SELECT * FROM email_messages WHERE account_id = ? AND folder_id = ? AND uid = ?`,
    )
    .get(accountId, folder.id, String(uid));
  return mapMessageRow(row);
}

/**
 * Resolve a UI/agent message ref to an IMAP uid + folder.
 * Accepts Himalaya uids and Dome cache row ids (`emsg-<hash>`).
 * @returns {{ accountId: string|null, uid: string, folder: string, row: object|null } | null}
 */
function resolveMessageRef(messageId, { accountId = null, folder = 'INBOX' } = {}) {
  const raw = String(messageId || '').trim();
  if (!raw) return null;

  if (raw.startsWith('emsg-')) {
    const row = db()
      .prepare(
        `SELECT m.*, f.remote_name
         FROM email_messages m
         JOIN email_folders f ON f.id = m.folder_id
         WHERE m.id = ?`,
      )
      .get(raw);
    if (!row) return null;
    if (accountId && row.account_id !== accountId) return null;
    return {
      accountId: row.account_id,
      uid: String(row.uid),
      folder: row.remote_name || folder || 'INBOX',
      row: mapMessageRow(row),
    };
  }

  if (accountId) {
    const folderRow = getFolderByRemote(accountId, folder);
    if (folderRow) {
      const row = db()
        .prepare(
          `SELECT m.*, f.remote_name
           FROM email_messages m
           JOIN email_folders f ON f.id = m.folder_id
           WHERE m.account_id = ? AND m.folder_id = ? AND m.uid = ?`,
        )
        .get(accountId, folderRow.id, raw);
      if (row) {
        return {
          accountId: row.account_id,
          uid: String(row.uid),
          folder: row.remote_name || folder || 'INBOX',
          row: mapMessageRow(row),
        };
      }
    }
  }

  return {
    accountId: accountId || null,
    uid: raw,
    folder: folder || 'INBOX',
    row: null,
  };
}

function cacheMessageBody(accountId, uid, folderRemoteName, { text, html } = {}) {
  const folder = getFolderByRemote(accountId, folderRemoteName);
  if (!folder) return false;
  const ts = now();
  const result = db()
    .prepare(
      `UPDATE email_messages SET
         body_text = COALESCE(@body_text, body_text),
         body_html = COALESCE(@body_html, body_html),
         updated_at = @ts
       WHERE account_id = @account_id AND folder_id = @folder_id AND uid = @uid`,
    )
    .run({
      account_id: accountId,
      folder_id: folder.id,
      uid: String(uid),
      body_text: text ?? null,
      body_html: html ?? null,
      ts,
    });
  return result.changes > 0;
}

function setSyncState(accountId, folderId, patch = {}) {
  const id = syncStateId(accountId, folderId);
  const ts = now();
  const existing = db().prepare('SELECT * FROM email_sync_state WHERE id = ?').get(id);
  if (existing) {
    db()
      .prepare(
        `UPDATE email_sync_state SET
           last_uid = COALESCE(@last_uid, last_uid),
           cursor = COALESCE(@cursor, cursor),
           last_synced_at = COALESCE(@last_synced_at, last_synced_at),
           status = COALESCE(@status, status),
           error = @error,
           updated_at = @ts
         WHERE id = @id`,
      )
      .run({
        id,
        last_uid: patch.lastUid ?? null,
        cursor: patch.cursor ?? null,
        last_synced_at: patch.lastSyncedAt ?? null,
        status: patch.status ?? null,
        error: patch.error ?? null,
        ts,
      });
  } else {
    db()
      .prepare(
        `INSERT INTO email_sync_state
          (id, account_id, folder_id, last_uid, cursor, last_synced_at, status, error, updated_at)
         VALUES (@id, @account_id, @folder_id, @last_uid, @cursor, @last_synced_at, @status, @error, @ts)`,
      )
      .run({
        id,
        account_id: accountId,
        folder_id: folderId,
        last_uid: patch.lastUid ?? null,
        cursor: patch.cursor ?? null,
        last_synced_at: patch.lastSyncedAt ?? null,
        status: patch.status ?? 'idle',
        error: patch.error ?? null,
        ts,
      });
  }
  return db().prepare('SELECT * FROM email_sync_state WHERE id = ?').get(id);
}

function getSyncStatus(accountId) {
  return db()
    .prepare(
      `SELECT s.*, f.remote_name
       FROM email_sync_state s
       JOIN email_folders f ON f.id = s.folder_id
       WHERE s.account_id = ?
       ORDER BY f.remote_name`,
    )
    .all(accountId);
}

function extractAddressesFromEnvelope(env) {
  const addrs = [];
  for (const field of ['from', 'to', 'cc']) {
    for (const a of parseAddrList(env?.[field])) {
      const email = (a?.addr || a?.email || (typeof a === 'string' ? a : '')).trim();
      if (!email || !email.includes('@')) continue;
      addrs.push({
        email: email.toLowerCase(),
        name: a?.name || null,
      });
    }
  }
  return addrs;
}

module.exports = {
  folderIdFor,
  messageRowId,
  upsertFolder,
  getFolderByRemote,
  listFolders,
  upsertEnvelope,
  listCachedEnvelopes,
  getCachedMessage,
  resolveMessageRef,
  cacheMessageBody,
  normalizeEnvelope,
  setSyncState,
  getSyncStatus,
  extractAddressesFromEnvelope,
  mapMessageRow,
  secureTimestampId,
};
