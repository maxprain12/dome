/* eslint-disable no-console */
/**
 * Cloud Storage IPC handlers — Google Drive & OneDrive
 *
 * Uses native HTTP requests + PKCE OAuth (same pattern as google-calendar-service.cjs).
 * No external googleapis/msal packages required.
 *
 * OAuth tokens are stored in the `settings` DB table under key `cloud_accounts`
 * as a JSON array: [{ provider, accountId, email, accessToken, refreshToken, expiresAt }]
 *
 * Redirect URI registered in your Google / Microsoft app console: dome://oauth/callback
 */

const crypto = require('crypto');
const https = require('https');
const { shell } = require('electron');

// ─── OAuth constants ──────────────────────────────────────────────────────────

const REDIRECT_URI = 'dome://oauth/callback';

const GOOGLE_AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
].join(' ');

const MS_AUTH_URL   = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_DRIVE_SCOPES = 'openid email offline_access Files.Read';

// ─── Pending OAuth state ──────────────────────────────────────────────────────

/** @type {{ provider: string, codeVerifier: string, state: string } | null} */
let _pendingOAuth = null;

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

/** Simple HTTPS GET/POST helper */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function urlEncode(params) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function loadAccounts(database) {
  try {
    const row = database.getQueries().getSetting?.get?.('cloud_accounts');
    return row?.value ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

function saveAccounts(database, accounts) {
  try {
    const queries = database.getQueries();
    const json = JSON.stringify(accounts);
    const existing = queries.getSetting?.get?.('cloud_accounts');
    if (existing) {
      queries.updateSetting?.run?.(json, 'cloud_accounts');
    } else {
      queries.insertSetting?.run?.('cloud_accounts', json);
    }
  } catch (err) {
    console.error('[CloudStorage] Failed to save accounts:', err.message);
  }
}

function isTokenExpired(account) {
  if (!account.expiresAt) return true;
  return Date.now() >= account.expiresAt - 60_000; // 1 min buffer
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

async function refreshMsToken(account) {
  const clientId = process.env.DOME_ONEDRIVE_CLIENT_ID;
  if (!clientId || !account.refreshToken) return null;

  const body = urlEncode({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: account.refreshToken,
    scope: MS_DRIVE_SCOPES,
  });
  const data = await httpsRequest(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
  }, body);
  if (!data.access_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || account.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

async function getValidToken(database, account) {
  if (!isTokenExpired(account)) return account.accessToken;
  const refreshed = account.provider === 'google'
    ? await refreshGoogleToken(account)
    : await refreshMsToken(account);
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
  // For Google Docs/Sheets/Slides — export as PDF; for binary files — download directly
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

// ─── OneDrive API ─────────────────────────────────────────────────────────────

async function oneDriveListFiles(token, folderId, query) {
  let url;
  if (query) {
    url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?$select=id,name,file,folder,size,lastModifiedDateTime&$top=50`;
  } else {
    const parent = folderId ? `items/${folderId}` : 'root';
    url = `https://graph.microsoft.com/v1.0/me/drive/${parent}/children?$select=id,name,file,folder,size,lastModifiedDateTime&$top=50`;
  }
  return httpsRequest(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function oneDriveDownloadFile(token, fileId) {
  const metaUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?$select=id,name,file,size`;
  const meta = await httpsRequest(metaUrl, { headers: { Authorization: `Bearer ${token}` } });

  // Get download URL
  const linkUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
  return new Promise((resolve, reject) => {
    const parsed = new URL(linkUrl);
    const req = https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          const location = res.headers['location'];
          https.get(location, (res2) => {
            const chunks = [];
            res2.on('data', (c) => chunks.push(c));
            res2.on('end', () => resolve({ meta, buffer: Buffer.concat(chunks) }));
          }).on('error', reject);
        } else {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ meta, buffer: Buffer.concat(chunks) }));
        }
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
   * Start Google Drive OAuth flow (PKCE via shell.openExternal)
   */
  ipcMain.handle('cloud:auth-google', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };

    const clientId = process.env.DOME_GOOGLE_DRIVE_CLIENT_ID;
    if (!clientId) {
      return { success: false, error: 'DOME_GOOGLE_DRIVE_CLIENT_ID env var not set. Configure your Google OAuth app and set this variable.' };
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    _pendingOAuth = { provider: 'google', codeVerifier, state };

    const params = urlEncode({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_DRIVE_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    await shell.openExternal(`${GOOGLE_AUTH_URL}?${params}`);
    return { success: true, message: 'OAuth flow started — complete sign-in in your browser.' };
  });

  /**
   * Start OneDrive OAuth flow (PKCE via shell.openExternal)
   */
  ipcMain.handle('cloud:auth-onedrive', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };

    const clientId = process.env.DOME_ONEDRIVE_CLIENT_ID;
    if (!clientId) {
      return { success: false, error: 'DOME_ONEDRIVE_CLIENT_ID env var not set. Configure your Microsoft Azure app and set this variable.' };
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    _pendingOAuth = { provider: 'onedrive', codeVerifier, state };

    const params = urlEncode({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: MS_DRIVE_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    await shell.openExternal(`${MS_AUTH_URL}?${params}`);
    return { success: true, message: 'OAuth flow started — complete sign-in in your browser.' };
  });

  /**
   * Handle OAuth callback (called by deep-link handler when dome://oauth/callback?code=...&state=... is received)
   * Exported so deep-link-handler.cjs can call it.
   */
  async function handleOAuthCallback(url) {
    if (!_pendingOAuth) return false;
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    if (!code || state !== _pendingOAuth.state) return false;

    const { provider, codeVerifier } = _pendingOAuth;
    _pendingOAuth = null;

    try {
      let tokenData;
      if (provider === 'google') {
        const clientId = process.env.DOME_GOOGLE_DRIVE_CLIENT_ID;
        const clientSecret = process.env.DOME_GOOGLE_DRIVE_CLIENT_SECRET;
        const body = urlEncode({
          code,
          client_id: clientId,
          client_secret: clientSecret || '',
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        });
        tokenData = await httpsRequest(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
        }, body);
      } else {
        const clientId = process.env.DOME_ONEDRIVE_CLIENT_ID;
        const body = urlEncode({
          code,
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
          scope: MS_DRIVE_SCOPES,
        });
        tokenData = await httpsRequest(MS_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
        }, body);
      }

      if (!tokenData.access_token) {
        console.error('[CloudStorage] Token exchange failed:', tokenData);
        windowManager.broadcast('cloud:auth-result', { success: false, provider, error: tokenData.error_description || 'Token exchange failed' });
        return true;
      }

      // Get user email
      let email = 'Unknown';
      try {
        if (provider === 'google') {
          const info = await httpsRequest('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          email = info.email || email;
        } else {
          const info = await httpsRequest('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          email = info.mail || info.userPrincipalName || email;
        }
      } catch { /* non-critical */ }

      const accountId = `${provider}-${email}`;
      const accounts = loadAccounts(database);
      const existingIdx = accounts.findIndex((a) => a.accountId === accountId);
      const account = {
        provider,
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

      windowManager.broadcast('cloud:auth-result', { success: true, provider, email, accountId });
      return true;
    } catch (err) {
      console.error('[CloudStorage] OAuth callback error:', err);
      windowManager.broadcast('cloud:auth-result', { success: false, provider, error: err.message });
      return true;
    }
  }

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

      let data;
      if (account.provider === 'google') {
        data = await googleListFiles(token, folderId, query);
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
      } else {
        data = await oneDriveListFiles(token, folderId, query);
        const files = (data.value || []).map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.file?.mimeType || null,
          size: f.size || null,
          modifiedAt: f.lastModifiedDateTime,
          isFolder: !!f.folder,
          provider: 'onedrive',
          accountId,
        }));
        return { success: true, files };
      }
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

      // Download file
      let downloadResult;
      if (account.provider === 'google') {
        downloadResult = await googleDownloadFile(token, fileId);
      } else {
        downloadResult = await oneDriveDownloadFile(token, fileId);
      }

      const { meta, buffer } = downloadResult;
      const name = fileName || meta.name || 'imported-file';
      const effectiveMime = mimeType || meta.mimeType || meta.file?.mimeType || 'application/octet-stream';

      // Determine extension and resource type
      const ext = path.extname(name).toLowerCase() || (effectiveMime.includes('pdf') ? '.pdf' : '.bin');
      const effectiveType = effectiveMime.includes('pdf') || ext === '.pdf' ? 'pdf' : 'document';

      // Write to temp file
      const tempPath = path.join(os.tmpdir(), `dome-cloud-${Date.now()}${ext}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const importResult = await fileStorage.importFile(tempPath, effectiveType);
        const queries = database.getQueries();

        // Check duplicate
        const existing = queries.findByHash?.get(importResult.hash);
        if (existing) {
          return { success: false, error: 'duplicate', duplicate: { id: existing.id, title: existing.title } };
        }

        // Extract text
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

        // Schedule indexing
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

  // Export handleOAuthCallback so deep-link-handler can delegate to it
  register._handleOAuthCallback = handleOAuthCallback;
}

module.exports = { register };
