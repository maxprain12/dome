/* eslint-disable no-console */
/**
 * himalaya email service (main process).
 *
 * - Accounts live in SQLite `email_accounts`; the IMAP/SMTP password is encrypted
 *   at rest with Electron safeStorage (electron/core/secret-storage.cjs).
 * - On each call we (re)generate himalaya's `config.toml` from the stored accounts.
 *   The password is NEVER written to the TOML: the config uses an `auth.cmd` that
 *   reads it from an env var, and we inject the decrypted secret into the spawned
 *   process env (only for the account being used, selected via `-a <id>`).
 * - himalaya is invoked with `-o json` and the structured output is parsed.
 *
 * himalaya CLI surface targeted: v1.x (see himalaya-binary.cjs for the pinned version).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const database = require('../core/database.cjs');
const { encryptSecret, decryptSecret, maskSecret } = require('../core/secret-storage.cjs');
const { ensureHimalaya } = require('./himalaya-binary.cjs');

let app = null;
try {
  ({ app } = require('electron'));
} catch {
  /* unit tests */
}

const PASSWORD_ENV = 'DOME_HIMALAYA_PASSWORD';
const RUN_TIMEOUT_MS = 60_000;

/**
 * Map raw himalaya/IMAP/SMTP error text to a stable code the renderer can
 * localize into actionable guidance. Order matters (most specific first).
 */
const ERROR_PATTERNS = [
  {
    code: 'app_password_required',
    re: /application-specific password required|app password|app-specific password/i,
    helpUrl: 'https://support.google.com/accounts/answer/185833',
  },
  {
    code: 'auth_failed',
    re: /authentication failed|invalid credentials|username and password not accepted|authenticationfailed|login failed|cannot authenticate|\[AUTH\]/i,
    helpUrl: null,
  },
  {
    code: 'connection_failed',
    re: /cannot connect|connection refused|failed to lookup|dns|timed out|timeout|network is unreachable|no route to host|cannot build (imap|smtp) client/i,
    helpUrl: null,
  },
  {
    code: 'tls_error',
    re: /certificate|tls|ssl handshake|invalid peer certificate/i,
    helpUrl: null,
  },
  {
    code: 'binary_unavailable',
    re: /himalaya binary|download failed|unsupported platform|unsupported architecture|not found after extraction/i,
    helpUrl: null,
  },
];

/** Strip ANSI codes and pull the most specific line out of himalaya's multi-line error chain. */
function extractConciseError(raw) {
  // eslint-disable-next-line no-control-regex
  const clean = String(raw || '').replace(/\[[0-9;]*m/g, '').trim();
  if (!clean) return '';
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // himalaya prints a numbered chain ("0:", "1:", ...); the deepest is most specific.
  const numbered = lines.filter((l) => /^\d+:\s*/.test(l)).map((l) => l.replace(/^\d+:\s*/, ''));
  if (numbered.length) return numbered[numbered.length - 1];
  return lines.find((l) => !/^note:/i.test(l)) || lines[0];
}

/** @returns {{ errorCode: string, helpUrl: string|null }} */
function classifyEmailError(raw) {
  const text = String(raw || '');
  for (const p of ERROR_PATTERNS) {
    if (p.re.test(text)) return { errorCode: p.code, helpUrl: p.helpUrl };
  }
  return { errorCode: 'unknown', helpUrl: null };
}

function configDir() {
  const base = app ? app.getPath('userData') : path.join(os.homedir(), '.dome');
  return path.join(base, 'himalaya');
}
function configPath() {
  return path.join(configDir(), 'config.toml');
}

// ---------------------------------------------------------------------------
// Account persistence
// ---------------------------------------------------------------------------

function db() {
  return database.getDB();
}

function rowToAccount(row, { withSecret = false } = {}) {
  if (!row) return null;
  const account = {
    id: row.id,
    email: row.email,
    display_name: row.display_name || '',
    imap_host: row.imap_host,
    imap_port: row.imap_port,
    imap_encryption: row.imap_encryption || 'tls',
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_encryption: row.smtp_encryption || 'tls',
    username: row.username,
    is_default: !!row.is_default,
    status: row.status || 'active',
    secret_masked: maskSecret(decryptSecret(row.secret)),
    user_actions: parseEmailActionsJson(row.user_actions, DEFAULT_USER_ACTIONS),
    agent_actions: parseEmailActionsJson(row.agent_actions, DEFAULT_AGENT_ACTIONS),
  };
  if (withSecret) account._secret = decryptSecret(row.secret);
  return account;
}

const DEFAULT_USER_ACTIONS = Object.freeze({
  list: true, read: true, search: true, send: true, reply: true,
});
const DEFAULT_AGENT_ACTIONS = Object.freeze({
  list: true, read: true, search: true, send: false, reply: false,
});

function parseEmailActionsJson(raw, fallback) {
  if (!raw) return { ...fallback };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return { ...fallback };
    return {
      list: parsed.list !== false,
      read: parsed.read !== false,
      search: parsed.search !== false,
      send: typeof parsed.send === 'boolean' ? parsed.send : fallback.send,
      reply: typeof parsed.reply === 'boolean' ? parsed.reply : fallback.reply,
    };
  } catch {
    return { ...fallback };
  }
}

function serializeEmailActions(actions, fallback) {
  const merged = { ...fallback, ...(actions || {}) };
  return JSON.stringify({
    list: merged.list !== false,
    read: merged.read !== false,
    search: merged.search !== false,
    send: merged.send === true,
    reply: merged.reply === true,
  });
}

function getAccountActionPermissions(accountId) {
  const row = getAccountRow(accountId);
  if (!row) {
    return { user: { ...DEFAULT_USER_ACTIONS }, agent: { ...DEFAULT_AGENT_ACTIONS } };
  }
  return {
    user: parseEmailActionsJson(row.user_actions, DEFAULT_USER_ACTIONS),
    agent: parseEmailActionsJson(row.agent_actions, DEFAULT_AGENT_ACTIONS),
  };
}

function updateAccountPermissions(accountId, { user_actions, agent_actions } = {}) {
  const row = getAccountRow(accountId);
  if (!row) return { success: false, error: 'Account not found' };
  const userJson = user_actions
    ? serializeEmailActions(user_actions, DEFAULT_USER_ACTIONS)
    : row.user_actions || serializeEmailActions(DEFAULT_USER_ACTIONS, DEFAULT_USER_ACTIONS);
  const agentJson = agent_actions
    ? serializeEmailActions(agent_actions, DEFAULT_AGENT_ACTIONS)
    : row.agent_actions || serializeEmailActions(DEFAULT_AGENT_ACTIONS, DEFAULT_AGENT_ACTIONS);
  db()
    .prepare('UPDATE email_accounts SET user_actions = ?, agent_actions = ?, updated_at = ? WHERE id = ?')
    .run(userJson, agentJson, Date.now(), accountId);
  return { success: true, accounts: listAccounts().accounts };
}

function getAccountRow(accountId) {
  return db().prepare('SELECT * FROM email_accounts WHERE id = ?').get(accountId);
}

function listAccountRows(projectId = null) {
  const pid = projectId && String(projectId).trim() ? String(projectId).trim() : null;
  if (pid) {
    return db()
      .prepare('SELECT * FROM email_accounts WHERE project_id = ? ORDER BY is_default DESC, created_at ASC')
      .all(pid);
  }
  return db().prepare('SELECT * FROM email_accounts ORDER BY is_default DESC, created_at ASC').all();
}

function listAccounts(projectId = null) {
  return { success: true, accounts: listAccountRows(projectId).map((r) => rowToAccount(r)) };
}

function resolveAccountId(accountId, projectId = null) {
  if (accountId) return accountId;
  const pid = projectId && String(projectId).trim() ? String(projectId).trim() : null;
  if (pid) {
    const def = db()
      .prepare('SELECT id FROM email_accounts WHERE project_id = ? AND is_default = 1 LIMIT 1')
      .get(pid);
    if (def) return def.id;
    const first = db()
      .prepare('SELECT id FROM email_accounts WHERE project_id = ? ORDER BY created_at ASC LIMIT 1')
      .get(pid);
    return first ? first.id : null;
  }
  const def = db().prepare('SELECT id FROM email_accounts WHERE is_default = 1 LIMIT 1').get();
  if (def) return def.id;
  const first = db().prepare('SELECT id FROM email_accounts ORDER BY created_at ASC LIMIT 1').get();
  return first ? first.id : null;
}

function addAccount(input) {
  const now = Date.now();
  const id = `email-${crypto.randomBytes(6).toString('hex')}`;
  const projectId = input.project_id || input.projectId || 'default';
  const existingCount = db()
    .prepare('SELECT COUNT(*) AS n FROM email_accounts WHERE project_id = ?')
    .get(projectId).n;
  const isDefault = existingCount === 0 ? 1 : input.is_default ? 1 : 0;
  if (isDefault) db().prepare('UPDATE email_accounts SET is_default = 0 WHERE project_id = ?').run(projectId);

  db()
    .prepare(
      `INSERT INTO email_accounts
        (id, email, display_name, imap_host, imap_port, imap_encryption,
         smtp_host, smtp_port, smtp_encryption, username, secret, is_default, status,
         user_actions, agent_actions, project_id, created_at, updated_at)
       VALUES (@id,@email,@display_name,@imap_host,@imap_port,@imap_encryption,
         @smtp_host,@smtp_port,@smtp_encryption,@username,@secret,@is_default,'active',
         @user_actions,@agent_actions,@project_id,@now,@now)`,
    )
    .run({
      id,
      email: input.email,
      display_name: input.display_name || '',
      imap_host: input.imap_host,
      imap_port: Number(input.imap_port) || 993,
      imap_encryption: input.imap_encryption || 'tls',
      smtp_host: input.smtp_host,
      smtp_port: Number(input.smtp_port) || 465,
      smtp_encryption: input.smtp_encryption || 'tls',
      username: input.username || input.email,
      secret: encryptSecret(input.password || ''),
      is_default: isDefault,
      user_actions: serializeEmailActions(input.user_actions, DEFAULT_USER_ACTIONS),
      agent_actions: serializeEmailActions(input.agent_actions, DEFAULT_AGENT_ACTIONS),
      project_id: projectId,
      now,
    });

  writeConfig();
  return { success: true, accountId: id, accounts: listAccounts(projectId).accounts };
}

function removeAccount(accountId) {
  const row = getAccountRow(accountId);
  if (!row) return { success: false, error: 'Account not found' };
  db().prepare('DELETE FROM email_accounts WHERE id = ?').run(accountId);
  if (row.is_default) {
    const next = db().prepare('SELECT id FROM email_accounts ORDER BY created_at ASC LIMIT 1').get();
    if (next) db().prepare('UPDATE email_accounts SET is_default = 1 WHERE id = ?').run(next.id);
  }
  writeConfig();
  return { success: true, accounts: listAccounts().accounts };
}

// ---------------------------------------------------------------------------
// himalaya config generation
// ---------------------------------------------------------------------------

/** Password command (per platform) that echoes the injected env var. himalaya trims the output. */
function passwordCmd() {
  return process.platform === 'win32'
    ? `cmd /C echo %${PASSWORD_ENV}%`
    : `printenv ${PASSWORD_ENV}`;
}

function tomlAccountSection(row) {
  const pwCmd = passwordCmd().replace(/"/g, '\\"');
  const enc = (e) => (e === 'starttls' || e === 'start-tls' ? 'start-tls' : e === 'none' ? 'none' : 'tls');
  return [
    `[accounts.${row.id}]`,
    `email = "${row.email}"`,
    `display-name = "${(row.display_name || '').replace(/"/g, '\\"')}"`,
    row.is_default ? 'default = true' : '',
    '',
    'backend.type = "imap"',
    `backend.host = "${row.imap_host}"`,
    `backend.port = ${row.imap_port}`,
    `backend.encryption.type = "${enc(row.imap_encryption)}"`,
    `backend.login = "${row.username}"`,
    'backend.auth.type = "password"',
    `backend.auth.cmd = "${pwCmd}"`,
    '',
    'message.send.backend.type = "smtp"',
    `message.send.backend.host = "${row.smtp_host}"`,
    `message.send.backend.port = ${row.smtp_port}`,
    `message.send.backend.encryption.type = "${enc(row.smtp_encryption)}"`,
    `message.send.backend.login = "${row.username}"`,
    'message.send.backend.auth.type = "password"',
    `message.send.backend.auth.cmd = "${pwCmd}"`,
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function writeConfig() {
  const rows = listAccountRows();
  fs.mkdirSync(configDir(), { recursive: true });
  const body = ['# Generated by Dome — do not edit by hand.', '', ...rows.map(tomlAccountSection)].join('\n');
  fs.writeFileSync(configPath(), body, { mode: 0o600 });
  return configPath();
}

// ---------------------------------------------------------------------------
// himalaya invocation
// ---------------------------------------------------------------------------

/**
 * Run himalaya with JSON output.
 * @param {string[]} args  himalaya args (without -o/-c)
 * @param {{ accountId?: string, input?: string }} [opts]
 */
async function runHimalaya(args, opts = {}) {
  const bin = await ensureHimalaya({ settingPath: getSettingPath() });
  writeConfig();

  const env = { ...process.env };
  if (opts.accountId) {
    const row = getAccountRow(opts.accountId);
    if (!row) throw new Error('Account not found');
    env[PASSWORD_ENV] = decryptSecret(row.secret);
  }

  const fullArgs = ['-c', configPath(), ...args, '-o', 'json'];
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      fullArgs,
      { env, timeout: RUN_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const raw = (stderr || err.message || '').toString();
          const { errorCode, helpUrl } = classifyEmailError(raw);
          // Keep a concise, human-relevant line for the `unknown` fallback.
          const concise = extractConciseError(raw) || `himalaya failed: ${err.message}`;
          const e = new Error(concise);
          e.errorCode = errorCode;
          e.helpUrl = helpUrl;
          return reject(e);
        }
        const text = (stdout || '').toString().trim();
        if (!text) return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(text); // not JSON (e.g. raw message body)
        }
      },
    );
    if (opts.input != null) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Domain operations
// ---------------------------------------------------------------------------

function normalizeFolderEntry(x) {
  if (typeof x === 'string') return { name: x, desc: '' };
  if (x && typeof x === 'object') {
    const name = x.name || x.path || x.folder || '';
    return { name: String(name), desc: String(x.desc || x.description || '') };
  }
  return null;
}

function normalizeFolders(data) {
  const raw = Array.isArray(data) ? data : data?.folders || [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const entry = normalizeFolderEntry(item);
    if (!entry?.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    out.push(entry);
  }
  out.sort((a, b) => {
    if (a.name.toUpperCase() === 'INBOX') return -1;
    if (b.name.toUpperCase() === 'INBOX') return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return out;
}

async function listFolders(accountId, projectId = null) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured', folders: [] };
  const data = await runHimalaya(['folder', 'list'], { accountId: id });
  return { success: true, folders: normalizeFolders(data) };
}

async function listEnvelopes(accountId, { folder = 'INBOX', page = 1, pageSize = 30, projectId = null } = {}) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured', envelopes: [] };
  const data = await runHimalaya(
    ['envelope', 'list', '-f', folder, '--page', String(page), '--page-size', String(pageSize)],
    { accountId: id },
  );
  return { success: true, envelopes: Array.isArray(data) ? data : data?.envelopes || [], accountId: id, folder };
}

async function searchEnvelopes(accountId, query, { folder = 'INBOX', pageSize = 30, projectId = null } = {}) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured', envelopes: [] };
  const args = ['envelope', 'list', '-f', folder, '--page-size', String(pageSize)];
  if (query && query.trim()) args.push(query.trim());
  const data = await runHimalaya(args, { accountId: id });
  return { success: true, envelopes: Array.isArray(data) ? data : data?.envelopes || [], accountId: id };
}

/** Temp dir where himalaya `message export` writes index.html + plain.txt per MIME part. */
function messageExportDir(accountId, messageId, folder) {
  const base = app ? app.getPath('userData') : path.join(os.homedir(), '.dome');
  const key = crypto.createHash('sha256').update(`${accountId}:${folder}:${messageId}`).digest('hex').slice(0, 16);
  return path.join(base, 'email-export', key);
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Parse the header block from `message read -H From -H Subject …`. */
function parseHeaderBlock(text) {
  const headers = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) break;
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return headers;
}

async function readMessageHeaders(accountId, messageId, { folder = 'INBOX' } = {}) {
  const data = await runHimalaya(
    [
      'message',
      'read',
      String(messageId),
      '-f',
      folder,
      '--preview',
      '-H',
      'From',
      '-H',
      'Subject',
      '-H',
      'Message-ID',
    ],
    { accountId },
  );
  return parseHeaderBlock(typeof data === 'string' ? data : '');
}

/**
 * Read message body for display.
 *
 * `message read` only returns the plain-text part when both plain+HTML exist.
 * `message export` writes `index.html` and `plain.txt` — we prefer the HTML file.
 */
async function readMessage(accountId, messageId, { folder = 'INBOX', projectId = null } = {}) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured' };

  const dest = messageExportDir(id, messageId, folder);
  fs.mkdirSync(dest, { recursive: true });
  emptyDir(dest);

  let html = null;
  let plain = null;

  try {
    await runHimalaya(['message', 'export', String(messageId), '-f', folder, '-d', dest], { accountId: id });
    const htmlPath = path.join(dest, 'index.html');
    const plainPath = path.join(dest, 'plain.txt');
    if (fs.existsSync(htmlPath)) html = fs.readFileSync(htmlPath, 'utf8');
    if (fs.existsSync(plainPath)) plain = fs.readFileSync(plainPath, 'utf8');
  } catch (err) {
    console.warn('[himalaya] message export failed, falling back to read:', err.message);
  }

  if (!html && !plain) {
    const data = await runHimalaya(
      ['message', 'read', String(messageId), '-f', folder, '--no-headers', '--preview'],
      { accountId: id },
    );
    if (typeof data === 'string') plain = data;
    else if (data && typeof data === 'object') plain = data.body || data.text || data.plain || null;
  }

  return {
    success: true,
    message: { html, plain, text: plain },
    accountId: id,
  };
}

function rfc2047(subject) {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, cc, bcc, subject, body, extraHeaders = {} }) {
  const headers = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
  ];
  if (cc) headers.push(`Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}`);
  if (bcc) headers.push(`Bcc: ${Array.isArray(bcc) ? bcc.join(', ') : bcc}`);
  headers.push(`Subject: ${rfc2047(subject || '')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(extraHeaders)) if (v) headers.push(`${k}: ${v}`);
  return `${headers.join('\r\n')}\r\n\r\n${(body || '').replace(/\r?\n/g, '\r\n')}\r\n`;
}

async function sendMessage(accountId, { to, cc, bcc, subject, body, projectId = null }) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured' };
  if (!to) return { success: false, error: 'Recipient (to) is required' };
  const row = getAccountRow(id);
  const from = row.display_name ? `${row.display_name} <${row.email}>` : row.email;
  const mime = buildMime({ from, to, cc, bcc, subject, body });
  await runHimalaya(['message', 'send'], { accountId: id, input: mime });
  return { success: true };
}

async function replyMessage(accountId, messageId, { body, folder = 'INBOX', projectId = null } = {}) {
  const id = resolveAccountId(accountId, projectId);
  if (!id) return { success: false, error: 'No email account configured' };
  const headers = await readMessageHeaders(id, messageId, { folder });
  const origFrom = headers.from;
  const origSubject = headers.subject || '';
  const origMessageId = headers['message-id'];
  if (!origFrom) return { success: false, error: 'Could not determine the original sender to reply to' };

  const subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
  const row = getAccountRow(id);
  const from = row.display_name ? `${row.display_name} <${row.email}>` : row.email;
  const mime = buildMime({
    from,
    to: origFrom,
    subject,
    body,
    extraHeaders: origMessageId ? { 'In-Reply-To': origMessageId, References: origMessageId } : {},
  });
  await runHimalaya(['message', 'send'], { accountId: id, input: mime });
  return { success: true };
}

async function testConnection(accountId) {
  try {
    const res = await listFolders(accountId);
    if (res.success) return { success: true };
    return { success: false, error: res.error, ...classifyEmailError(res.error) };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      errorCode: err.errorCode || classifyEmailError(err.message).errorCode,
      helpUrl: err.helpUrl || classifyEmailError(err.message).helpUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Settings helper (optional explicit binary path)
// ---------------------------------------------------------------------------

function getSettingPath() {
  try {
    const row = db().prepare("SELECT value FROM settings WHERE key = 'email_himalaya_path'").get();
    return row?.value || null;
  } catch {
    return null;
  }
}

module.exports = {
  listAccounts,
  addAccount,
  removeAccount,
  updateAccountPermissions,
  getAccountActionPermissions,
  resolveAccountId,
  testConnection,
  listFolders,
  listEnvelopes,
  searchEnvelopes,
  readMessage,
  sendMessage,
  replyMessage,
  writeConfig,
  classifyEmailError,
};
