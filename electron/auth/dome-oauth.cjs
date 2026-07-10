/* eslint-disable no-console */
const crypto = require('crypto');
const { shell } = require('electron');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { encryptSessionField, decryptSessionField } = require('../core/settings-secrets.cjs');

function decodeSessionRow(row) {
  if (!row) return null;
  return {
    ...row,
    access_token: decryptSessionField(row.access_token),
    refresh_token: decryptSessionField(row.refresh_token),
  };
}

function persistSession(queries, userId, accessToken, refreshToken, expiresAt) {
  const now = Date.now();
  queries.upsertDomeProviderSession.run(
    userId,
    encryptSessionField(accessToken),
    refreshToken ? encryptSessionField(refreshToken) : null,
    expiresAt,
    now,
    now,
  );
}

const REDIRECT_URI = 'dome://dome-auth/oauth/callback';
const CLIENT_ID = 'dome-desktop';

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh if expiring within 5 min
const REFRESH_MAX_ATTEMPTS = 3;
const REFRESH_RETRY_BASE_MS = 400;

class RefreshTokenError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, fatal?: boolean }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'RefreshTokenError';
    this.status = opts.status;
    this.fatal = Boolean(opts.fatal);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isInvalidGrantResponse(status, bodyText) {
  if (status !== 400) return false;
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.error === 'invalid_grant';
  } catch {
    return bodyText.includes('invalid_grant');
  }
}

async function refreshAccessToken(database, refreshToken, attempt = 0) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  let response;
  try {
    response = await fetch(`${getDomeProviderBaseUrl()}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    if (attempt < REFRESH_MAX_ATTEMPTS - 1) {
      await sleep(REFRESH_RETRY_BASE_MS * (attempt + 1));
      return refreshAccessToken(database, refreshToken, attempt + 1);
    }
    throw new RefreshTokenError(err?.message || 'Refresh network error', { fatal: false });
  }

  if (!response.ok) {
    const text = await response.text();
    const fatal = isInvalidGrantResponse(response.status, text);
    if (!fatal && attempt < REFRESH_MAX_ATTEMPTS - 1) {
      await sleep(REFRESH_RETRY_BASE_MS * (attempt + 1));
      return refreshAccessToken(database, refreshToken, attempt + 1);
    }
    throw new RefreshTokenError(`Refresh failed: ${response.status} ${text}`, {
      status: response.status,
      fatal,
    });
  }

  const data = await response.json();
  if (!data.access_token) throw new RefreshTokenError('Refresh response missing access_token', { fatal: false });
  return data;
}

async function getOrRefreshSession(database) {
  try {
    const queries = database.getQueries();
    const row = decodeSessionRow(queries.getDomeProviderSessionWithRefresh.get());
    if (!row) return { connected: false };

    const now = Date.now();
    const expiresAt = row.expires_at;
    const needsRefresh = expiresAt <= now + REFRESH_BUFFER_MS;

    if (!needsRefresh) {
      return {
        connected: true,
        userId: row.user_id,
        accessToken: row.access_token,
        expiresAt: row.expires_at,
      };
    }

    if (row.refresh_token) {
      try {
        const tokenResponse = await refreshAccessToken(database, row.refresh_token);
        const newExpiresInSec = Number(tokenResponse.expires_in || 3600);
        const newExpiresAt = now + newExpiresInSec * 1000;
        persistSession(
          queries,
          row.user_id,
          tokenResponse.access_token,
          tokenResponse.refresh_token || row.refresh_token,
          newExpiresAt,
        );
        return {
          connected: true,
          userId: row.user_id,
          accessToken: tokenResponse.access_token,
          expiresAt: newExpiresAt,
        };
      } catch (err) {
        console.warn('[Dome OAuth] Refresh failed:', err?.message);
        const fatal = err instanceof RefreshTokenError && err.fatal;
        if (fatal && expiresAt <= now) {
          queries.clearDomeProviderSessions.run();
          return { connected: false };
        }
        return {
          connected: true,
          userId: row.user_id,
          accessToken: row.access_token,
          expiresAt: row.expires_at,
          stale: expiresAt <= now,
        };
      }
    }

    if (expiresAt <= now) return { connected: false };
    return {
      connected: true,
      userId: row.user_id,
      accessToken: row.access_token,
      expiresAt: row.expires_at,
    };
  } catch (error) {
    console.error('[Dome OAuth] getOrRefreshSession failed:', error);
    return { connected: false };
  }
}

async function fetchWithDomeAuth(database, url, options = {}) {
  let session = await getOrRefreshSession(database);
  if (!session.connected || !session.accessToken) {
    throw new Error('Dome provider is not connected. Open Settings > AI > Dome and connect your account.');
  }
  const doFetch = (token) => fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
  let response = await doFetch(session.accessToken);
  if (response.status === 401) {
    const row = decodeSessionRow(database.getQueries().getDomeProviderSessionWithRefresh.get());
    if (row?.refresh_token) {
      try {
        const tokenResponse = await refreshAccessToken(database, row.refresh_token);
        const now = Date.now();
        const newExpiresAt = now + Number(tokenResponse.expires_in || 3600) * 1000;
        persistSession(
          database.getQueries(),
          row.user_id,
          tokenResponse.access_token,
          tokenResponse.refresh_token || row.refresh_token,
          newExpiresAt,
        );
        response = await doFetch(tokenResponse.access_token);
      } catch (err) {
        console.warn('[Dome OAuth] Retry refresh on 401 failed:', err?.message);
      }
    }
  }
  return response;
}

async function getRemoteProfile(database) {
  try {
    const url = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/me`;
    const res = await fetchWithDomeAuth(database, url, { method: 'GET' });
    if (!res.ok) return { name: null, email: null };
    const data = await res.json();
    return {
      name: data.displayName ?? data.name ?? null,
      email: data.email ?? null,
    };
  } catch (err) {
    console.warn('[Dome OAuth] getRemoteProfile failed:', err?.message);
    return { name: null, email: null };
  }
}

async function finalizeAuthConnection(database, windowManager) {
  const planGate = require('../storage/plan-gate.cjs');
  planGate.invalidateEntitlementsCache();
  const sessionMgr = require('./dome-session-manager.cjs');
  await sessionMgr.refreshSessionIfNeeded();
  if (!windowManager) return { hadRemoteData: false };
  try {
    const { runPostLoginBootstrap } = require('../storage/post-login-bootstrap.cjs');
    return await runPostLoginBootstrap({ database, windowManager });
  } catch (err) {
    console.warn('[Dome OAuth] post-login bootstrap failed:', err?.message);
    return { hadRemoteData: false };
  }
}

function getSession(database) {
  try {
    const queries = database.getQueries();
    const row = decodeSessionRow(queries.getActiveDomeProviderSession.get(Date.now()));
    if (!row) return { connected: false };
    return {
      connected: true,
      userId: row.user_id,
      accessToken: row.access_token,
      expiresAt: row.expires_at,
    };
  } catch (error) {
    console.error('[Dome OAuth] Failed to read session:', error);
    return { connected: false };
  }
}

async function disconnect(database) {
  const queries = database.getQueries();
  const row = queries.getDomeProviderSessionWithRefresh.get();
  if (row?.refresh_token) {
    try {
      await fetch(`${getDomeProviderBaseUrl()}/api/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: row.refresh_token, token_type_hint: 'refresh_token' }),
      });
    } catch (err) {
      console.warn('[Dome OAuth] Revoke failed:', err?.message);
    }
  }
  queries.clearDomeProviderSessions.run();
}

function openDashboard() {
  shell.openExternal(`${getDomeProviderBaseUrl()}/dashboard`);
}

async function exchangeCodeForToken(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(`${getDomeProviderBaseUrl()}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('OAuth token response missing access_token');
  }
  return data;
}

const OAUTH_PENDING_TIMEOUT_MS = 10 * 60 * 1000;

function registerOAuthPending(pendingMap, key, entry) {
  const timer = setTimeout(() => {
    if (pendingMap.delete(key)) {
      entry.reject(new Error('OAuth timeout'));
    }
  }, OAUTH_PENDING_TIMEOUT_MS);
  pendingMap.set(key, { ...entry, timer });
}

function consumeOAuthPending(pendingMap, key) {
  const flow = pendingMap.get(key);
  if (!flow) return null;
  if (flow.timer) clearTimeout(flow.timer);
  pendingMap.delete(key);
  return flow;
}

function startOAuthFlow(database, windowManager) {
  return new Promise((resolve, reject) => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(24).toString('base64url');

    const authUrl = new URL(`${getDomeProviderBaseUrl()}/api/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    const pending = global.__domeOAuthPending || (global.__domeOAuthPending = new Map());
    registerOAuthPending(pending, state, { resolve, reject, codeVerifier, windowManager });

    shell.openExternal(authUrl.toString());
  });
}

async function exchangeConnectCode(code) {
  const response = await fetch(`${getDomeProviderBaseUrl()}/api/oauth/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Connect exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.access_token || !data.user_id) {
    throw new Error('Connect response missing access_token or user_id');
  }
  return data;
}

async function handleConnectCallback(url, database, windowManager) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'dome:' || !parsed.pathname.includes('/connect')) {
      return false;
    }

    const code = parsed.searchParams.get('code');
    if (!code) {
      console.warn('[Dome OAuth] Connect callback missing code');
      return true; // We handled the URL type
    }

    const tokenResponse = await exchangeConnectCode(code);
    const queries = database.getQueries();
    const now = Date.now();
    const expiresInSec = Number(tokenResponse.expires_in || 3600);
    persistSession(
      queries,
      tokenResponse.user_id,
      tokenResponse.access_token,
      tokenResponse.refresh_token || null,
      now + expiresInSec * 1000,
    );
    await finalizeAuthConnection(database, windowManager);
    console.log('[Dome OAuth] Connected via dashboard, user_id:', tokenResponse.user_id);
    return true;
  } catch (error) {
    console.error('[Dome OAuth] Connect callback error:', error?.message);
    return true; // We handled the URL type even if exchange failed
  }
}

function handleOAuthCallback(url, database, windowManager) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'dome:' || !parsed.pathname.includes('/oauth/callback')) {
      return false;
    }

    const state = parsed.searchParams.get('state');
    const code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    if (!state) return false;

    const pending = global.__domeOAuthPending;
    if (!pending || !pending.has(state)) {
      console.warn('[Dome OAuth] Callback with unknown or expired state ignored');
      return false;
    }
    const flow = consumeOAuthPending(pending, state);
    if (!flow) return false;

    if (error) {
      flow.reject(new Error(error));
      return true;
    }
    if (!code) {
      flow.reject(new Error('OAuth callback missing code'));
      return true;
    }

    exchangeCodeForToken(code, flow.codeVerifier)
      .then(async (tokenResponse) => {
        if (!tokenResponse.user_id) {
          throw new Error('OAuth token response missing user_id');
        }
        const queries = database.getQueries();
        const now = Date.now();
        const expiresInSec = Number(tokenResponse.expires_in || 3600);
        persistSession(
          queries,
          tokenResponse.user_id,
          tokenResponse.access_token,
          tokenResponse.refresh_token || null,
          now + expiresInSec * 1000,
        );
        const bootstrap = await finalizeAuthConnection(database, flow.windowManager || windowManager);
        flow.resolve({
          success: true,
          connected: true,
          userId: tokenResponse.user_id,
          hadRemoteData: Boolean(bootstrap?.hadRemoteData),
        });
      })
      .catch((exchangeError) => {
        flow.reject(exchangeError);
      });

    return true;
  } catch (error) {
    console.warn('[Dome OAuth] Callback parse error:', error?.message);
    return false;
  }
}

module.exports = {
  startOAuthFlow,
  handleOAuthCallback,
  handleConnectCallback,
  getSession,
  getOrRefreshSession,
  getRemoteProfile,
  finalizeAuthConnection,
  fetchWithDomeAuth,
  disconnect,
  openDashboard,
  getDomeProviderBaseUrl,
  persistSession,
};
