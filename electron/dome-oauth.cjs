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

function disconnect(database) {
  const queries = database.getQueries();
  queries.clearDomeProviderSessions.run();
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
  getSession,
  disconnect,
  PROVIDER_BASE_URL,
};
