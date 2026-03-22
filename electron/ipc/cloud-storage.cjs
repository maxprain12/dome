/* eslint-disable no-console */
/**
 * Cloud Storage IPC handlers — Google Drive
 *
 * Uses native HTTP requests + PKCE OAuth.
 * Google Drive: loopback HTTP server (http://127.0.0.1:PORT/callback)
 *   — required by Google's OAuth 2.0 policy for Desktop apps.
 *   No redirect URI registration needed in Google Console.
 *
 * OAuth tokens are stored in the `settings` DB table under key `cloud_accounts`
 * as a JSON array: [{ provider, accountId, email, accessToken, refreshToken, expiresAt }]
 */

const crypto = require('crypto');
const http   = require('http');
const https  = require('https');
const { shell } = require('electron');

// ─── OAuth constants ──────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL    = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
].join(' ');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');
  return { codeVerifier, codeChallenge };
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/** Simple HTTPS GET/POST helper with 15s timeout */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    };
    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        console.log(`[CloudStorage] HTTP ${res.statusCode} from ${parsed.hostname}${parsed.pathname}`);
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out: ${url}`)); });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function urlEncode(params) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// ─── Loopback server helpers (Google OAuth) ───────────────────────────────────

/** Asks the OS for a free port by binding to :0 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Starts a one-shot HTTP server on 127.0.0.1:port.
 * Resolves with the auth `code` when Google redirects back.
 * Times out after 5 minutes.
 */
function startLoopbackServer(port, expectedState) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        const code  = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
          '<h2>Dome: autorización completada ✓</h2>' +
          '<p>Puedes cerrar esta pestaña y volver a Dome.</p>' +
          '<script>window.close()</script>' +
          '</body></html>'
        );

        srv.close();

        if (error) {
          reject(new Error(error));
        } else if (!code || state !== expectedState) {
          reject(new Error('Invalid OAuth callback parameters'));
        } else {
          resolve(code);
        }
      } catch (err) {
        srv.close();
        reject(err);
      }
    });

    srv.listen(port, '127.0.0.1');
    srv.on('error', reject);

    // Abort if user takes too long
    setTimeout(() => { srv.close(); reject(new Error('OAuth timeout')); }, 5 * 60 * 1000);
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function loadAccounts(database) {
  try {
    const row = database.getQueries().getSetting.get('cloud_accounts');
    return row?.value ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

function saveAccounts(database, accounts) {
  try {
    const queries = database.getQueries();
    const json = JSON.stringify(accounts);
    queries.setSetting.run('cloud_accounts', json, Date.now());
    console.log('[CloudStorage] Accounts saved to DB:', accounts.length);
  } catch (err) {
    console.error('[CloudStorage] Failed to save accounts:', err.message);
  }
}

function isTokenExpired(account) {
  if (!account.expiresAt) return true;
  return Date.now() >= account.expiresAt - 60_000;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshGoogleToken(account) {
  const clientId = process.env.DOME_GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.DOME_GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !account.refreshToken) return null;

  const body = urlEncode({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refreshToken,
  });
  const data = await httpsRequest(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
  }, body);
  if (!data.access_token) return null;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

async function getValidToken(database, account) {
  if (!isTokenExpired(account)) return account.accessToken;
  const refreshed = await refreshGoogleToken(account);
  if (!refreshed) return null;
  const accounts = loadAccounts(database);
  const idx = accounts.findIndex((a) => a.accountId === account.accountId);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...refreshed };
    saveAccounts(database, accounts);
    return refreshed.accessToken;
  }
  return null;
}

// ─── Google Drive API ─────────────────────────────────────────────────────────

async function googleListFiles(token, folderId, query) {
  const q = query
    ? encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed = false`)
    : folderId
    ? encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    : encodeURIComponent("'root' in parents and trashed = false");

  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=50`;
  return httpsRequest(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function googleDownloadFile(token, fileId) {
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`;
  const meta = await httpsRequest(metaUrl, { headers: { Authorization: `Bearer ${token}` } });

  let downloadUrl;
  if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(downloadUrl);
    const req = https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ meta, buffer: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
  });
}

// ─── Register IPC handlers ────────────────────────────────────────────────────

function register({ ipcMain, windowManager, database, fileStorage }) {

  /**
   * Get all connected cloud accounts
   */
  ipcMain.handle('cloud:get-accounts', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const accounts = loadAccounts(database).map((a) => ({
        provider: a.provider,
        accountId: a.accountId,
        email: a.email,
        connected: true,
      }));
      return { success: true, accounts };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * Start Google Drive OAuth flow via loopback HTTP server.
   * Google redirects to http://127.0.0.1:PORT/callback — no URI registration needed.
   */
  ipcMain.handle('cloud:auth-google', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };

    const clientId = process.env.DOME_GOOGLE_DRIVE_CLIENT_ID;
    if (!clientId) {
      return { success: false, error: 'DOME_GOOGLE_DRIVE_CLIENT_ID env var not set. Configure your Google OAuth app and set this variable.' };
    }

    let port;
    try {
      port = await findFreePort();
    } catch (err) {
      return { success: false, error: `Could not allocate OAuth callback port: ${err.message}` };
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const params = urlEncode({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_DRIVE_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    // Handle the callback asynchronously — broadcast result when done
    startLoopbackServer(port, state)
      .then(async (code) => {
        console.log('[CloudStorage] Google loopback: got auth code, exchanging for token...');
        const clientSecret = process.env.DOME_GOOGLE_DRIVE_CLIENT_SECRET;
        if (!clientSecret) {
          console.warn('[CloudStorage] DOME_GOOGLE_DRIVE_CLIENT_SECRET is not set — token exchange may fail');
        }
        const body = urlEncode({
          code,
          client_id: clientId,
          client_secret: clientSecret || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        });
        const tokenData = await httpsRequest(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        }, body);

        console.log('[CloudStorage] Google token response keys:', Object.keys(tokenData));

        if (!tokenData.access_token) {
          console.error('[CloudStorage] Google token exchange failed:', tokenData);
          windowManager.broadcast('cloud:auth-result', {
            success: false, provider: 'google',
            error: tokenData.error_description || tokenData.error || 'Token exchange failed',
          });
          return;
        }

        let email = 'Unknown';
        try {
          const info = await httpsRequest('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          email = info.email || email;
        } catch (e) {
          console.warn('[CloudStorage] Could not fetch Google user info:', e.message);
        }

        const accountId = `google-${email}`;
        const accounts = loadAccounts(database);
        const existingIdx = accounts.findIndex((a) => a.accountId === accountId);
        const account = {
          provider: 'google',
          accountId,
          email,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        };
        if (existingIdx >= 0) {
          accounts[existingIdx] = account;
        } else {
          accounts.push(account);
        }
        saveAccounts(database, accounts);
        console.log('[CloudStorage] Google account saved, broadcasting success for', email);
        windowManager.broadcast('cloud:auth-result', { success: true, provider: 'google', email, accountId });
      })
      .catch((err) => {
        console.error('[CloudStorage] Google OAuth error:', err);
        windowManager.broadcast('cloud:auth-result', { success: false, provider: 'google', error: err.message });
      });

    await shell.openExternal(`${GOOGLE_AUTH_URL}?${params}`);
    return { success: true, message: 'OAuth flow started — complete sign-in in your browser.' };
  });

  /**
   * Disconnect a cloud account
   */
  ipcMain.handle('cloud:disconnect', async (event, { accountId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const accounts = loadAccounts(database).filter((a) => a.accountId !== accountId);
      saveAccounts(database, accounts);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * List files in a cloud folder
   */
  ipcMain.handle('cloud:list-files', async (event, { accountId, folderId, query }) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const accounts = loadAccounts(database);
      const account = accounts.find((a) => a.accountId === accountId);
      if (!account) return { success: false, error: 'Account not found' };

      const token = await getValidToken(database, account);
      if (!token) return { success: false, error: 'Failed to get valid token — please reconnect.' };

      const data = await googleListFiles(token, folderId, query);
      const files = (data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : null,
        modifiedAt: f.modifiedTime,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        provider: 'google',
        accountId,
      }));
      return { success: true, files };
    } catch (err) {
      console.error('[CloudStorage] list-files error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Download a cloud file and import it into Dome
   */
  ipcMain.handle('cloud:import-file', async (event, { accountId, fileId, fileName, mimeType, projectId, folderId: targetFolderId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const crypto = require('crypto');

    try {
      const accounts = loadAccounts(database);
      const account = accounts.find((a) => a.accountId === accountId);
      if (!account) return { success: false, error: 'Account not found' };

      const token = await getValidToken(database, account);
      if (!token) return { success: false, error: 'Failed to get valid token — please reconnect.' };

      const downloadResult = await googleDownloadFile(token, fileId);

      const { meta, buffer } = downloadResult;
      const name = fileName || meta.name || 'imported-file';
      const effectiveMime = mimeType || meta.mimeType || meta.file?.mimeType || 'application/octet-stream';

      const ext = path.extname(name).toLowerCase() || (effectiveMime.includes('pdf') ? '.pdf' : '.bin');
      const effectiveType = effectiveMime.includes('pdf') || ext === '.pdf' ? 'pdf' : 'document';

      const tempPath = path.join(os.tmpdir(), `dome-cloud-${Date.now()}${ext}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const importResult = await fileStorage.importFile(tempPath, effectiveType);
        const queries = database.getQueries();

        const existing = queries.findByHash?.get(importResult.hash);
        if (existing) {
          return { success: false, error: 'duplicate', duplicate: { id: existing.id, title: existing.title } };
        }

        const fullPath = fileStorage.getFullPath(importResult.internalPath);
        let contentText = null;
        try {
          const docExtractor = require('../document-extractor.cjs');
          if (effectiveType === 'pdf') {
            contentText = await docExtractor.extractTextFromPDF(fullPath, 50000);
          } else {
            contentText = await docExtractor.extractDocumentText(fullPath, importResult.mimeType);
          }
        } catch { /* non-critical */ }

        const resourceId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const now = Date.now();

        queries.createResourceWithFile.run(
          resourceId,
          projectId || null,
          effectiveType,
          name,
          contentText,
          null,
          importResult.internalPath,
          importResult.mimeType || effectiveMime,
          importResult.size,
          importResult.hash,
          null,
          name,
          null,
          now,
          now
        );

        if (targetFolderId && queries.moveResourceToFolder) {
          queries.moveResourceToFolder.run(targetFolderId, now, resourceId);
        }

        const resource = queries.getResourceById.get(resourceId);
        windowManager.broadcast('resource:created', resource);

        const resourceIndexer = require('../resource-indexer.cjs');
        if (resource && resourceIndexer.shouldIndex(resource)) {
          resourceIndexer.scheduleIndexing(resourceId, { database, fileStorage, windowManager });
        }

        return { success: true, resource };
      } finally {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[CloudStorage] import-file error:', err);
      return { success: false, error: err.message };
    }
  });

}

module.exports = { register };
