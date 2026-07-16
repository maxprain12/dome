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

function envelopeToFields(env) {
  const uid = String(env?.id ?? env?.uid ?? env?.message_id ?? '');
  const dateRaw = env?.date || env?.internal_date || null;
  let dateMs = null;
  if (dateRaw != null) {
    const t = Date.parse(dateRaw);
    dateMs = Number.isFinite(t) ? t : null;
    if (dateMs == null && typeof dateRaw === 'number') dateMs = dateRaw;
  }
  return {
    uid,
    messageId: env?.message_id || env?.messageId || null,
    subject: env?.subject ?? null,
    fromJson: JSON.stringify(env?.from ?? null),
    toJson: JSON.stringify(env?.to ?? null),
    ccJson: JSON.stringify(env?.cc ?? null),
    dateMs,
    snippet: env?.preview || env?.snippet || env?.subject || null,
    hasAttachments: env?.has_attachment || env?.has_attachments ? 1 : 0,
    flagsJson: JSON.stringify(env?.flags ?? env?.flag ?? null),
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
         subject = excluded.subject,
         from_json = excluded.from_json,
         to_json = excluded.to_json,
         cc_json = excluded.cc_json,
         date_ms = excluded.date_ms,
         snippet = excluded.snippet,
         has_attachments = excluded.has_attachments,
         flags_json = excluded.flags_json,
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

function listCachedEnvelopes(accountId, folderRemoteName, { limit = 50, offset = 0 } = {}) {
  const folder = getFolderByRemote(accountId, folderRemoteName);
  if (!folder) return [];
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
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
  cacheMessageBody,
  setSyncState,
  getSyncStatus,
  extractAddressesFromEnvelope,
  mapMessageRow,
  secureTimestampId,
};
