/* eslint-disable no-console */
const crypto = require('crypto');
const { shell } = require('electron');

const PROVIDER_BASE_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';
const REDIRECT_URI = 'dome://dome-auth/oauth/callback';
const CLIENT_ID = 'dome-desktop';

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function getUserIdentifier(database) {
  try {
    const queries = database.getQueries();
    const email = queries.getSetting.get('user_email')?.value;
    const name = queries.getSetting.get('user_name')?.value;
    if (email && email.trim()) return email.trim();
    if (name && name.trim()) return name.trim();
  } catch {
    // Ignore and fallback.
  }
  return `desktop-user-${Date.now()}`;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh if expiring within 5 min

async function refreshAccessToken(database, refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  const response = await fetch(`${PROVIDER_BASE_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Refresh failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  if (!data.access_token) throw new Error('Refresh response missing access_token');
  return data;
}

async function getOrRefreshSession(database) {
  try {
    const queries = database.getQueries();
    const row = queries.getDomeProviderSessionWithRefresh.get();
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
        queries.upsertDomeProviderSession.run(
          row.user_id,
          tokenResponse.access_token,
          tokenResponse.refresh_token || row.refresh_token,
          newExpiresAt,
          now,
          now,
        );
        return {
          connected: true,
          userId: row.user_id,
          accessToken: tokenResponse.access_token,
          expiresAt: newExpiresAt,
        };
      } catch (err) {
        console.warn('[Dome OAuth] Refresh failed:', err?.message);
        if (expiresAt <= now) {
          queries.clearDomeProviderSessions.run();
          return { connected: false };
        }
        return {
          connected: true,
          userId: row.user_id,
          accessToken: row.access_token,
          expiresAt: row.expires_at,
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
    const row = database.getQueries().getDomeProviderSessionWithRefresh.get();
    if (row?.refresh_token) {
      try {
        const tokenResponse = await refreshAccessToken(database, row.refresh_token);
        const now = Date.now();
        const newExpiresAt = now + Number(tokenResponse.expires_in || 3600) * 1000;
        database.getQueries().upsertDomeProviderSession.run(
          row.user_id,
          tokenResponse.access_token,
          tokenResponse.refresh_token || row.refresh_token,
          newExpiresAt,
          now,
          now,
        );
        response = await doFetch(tokenResponse.access_token);
      } catch (err) {
        console.warn('[Dome OAuth] Retry refresh on 401 failed:', err?.message);
      }
    }
  }
  return response;
}

function getSession(database) {
  try {
    const queries = database.getQueries();
    const row = queries.getActiveDomeProviderSession.get(Date.now());
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
      await fetch(`${PROVIDER_BASE_URL}/api/oauth/revoke`, {
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
  shell.openExternal(`${PROVIDER_BASE_URL}/dashboard`);
}

async function exchangeCodeForToken(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(`${PROVIDER_BASE_URL}/api/oauth/token`, {
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

function startOAuthFlow(database) {
  return new Promise((resolve, reject) => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(24).toString('base64url');
    const userId = getUserIdentifier(database);

    const authUrl = new URL(`${PROVIDER_BASE_URL}/api/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('user_id', userId);

    const pending = global.__domeOAuthPending || (global.__domeOAuthPending = new Map());
    pending.set(state, { resolve, reject, codeVerifier, userId });

    shell.openExternal(authUrl.toString());
  });
}

async function exchangeConnectCode(code) {
  const response = await fetch(`${PROVIDER_BASE_URL}/api/oauth/connect`, {
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

async function handleConnectCallback(url, database) {
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
    queries.upsertDomeProviderSession.run(
      tokenResponse.user_id,
      tokenResponse.access_token,
      tokenResponse.refresh_token || null,
      now + expiresInSec * 1000,
      now,
      now,
    );
    console.log('[Dome OAuth] Connected via dashboard, user_id:', tokenResponse.user_id);
    return true;
  } catch (error) {
    console.error('[Dome OAuth] Connect callback error:', error?.message);
    return true; // We handled the URL type even if exchange failed
  }
}

function handleOAuthCallback(url, database) {
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
    if (!pending || !pending.has(state)) return false;
    const flow = pending.get(state);
    pending.delete(state);

    if (error) {
      flow.reject(new Error(error));
      return true;
    }
    if (!code) {
      flow.reject(new Error('OAuth callback missing code'));
      return true;
    }

    exchangeCodeForToken(code, flow.codeVerifier)
      .then((tokenResponse) => {
        const queries = database.getQueries();
        const now = Date.now();
        const expiresInSec = Number(tokenResponse.expires_in || 3600);
        queries.upsertDomeProviderSession.run(
          flow.userId,
          tokenResponse.access_token,
          tokenResponse.refresh_token || null,
          now + expiresInSec * 1000,
          now,
          now,
        );
        flow.resolve({
          success: true,
          connected: true,
          userId: flow.userId,
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
  fetchWithDomeAuth,
  disconnect,
  openDashboard,
  PROVIDER_BASE_URL,
};
