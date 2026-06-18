'use strict';

/* eslint-disable no-console */

/**
 * GitHub OAuth (device-code flow) for the Dome ↔ GitHub project-sync feature.
 *
 * Mirrors electron/auth/github-copilot-oauth.cjs but uses Dome's own OAuth App
 * and the `repo` + `read:org` scopes needed to read/write issues, milestones,
 * branches and releases.
 *
 * Flow:
 *  1. startDeviceFlow() — ask GitHub for a device/user code.
 *  2. The user opens the verification URL and types the user code.
 *  3. pollForAccessToken() — poll until GitHub returns the OAuth token; the
 *     token is persisted (encrypted) in settings (`github_oauth_token`).
 *  4. getToken() — read the decrypted token for authenticated API calls.
 *
 * Setup: register a GitHub OAuth App with "Device flow" enabled and put its
 * client id in the DOME_GITHUB_CLIENT_ID env var (falls back to the constant
 * below for local dev builds).
 */

const database = require('../core/database.cjs');
const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

// Load baked-in credentials (production build), fall back to process.env (dev).
let _appCredentials = {};
try {
  _appCredentials = require('../app-credentials.cjs');
} catch {
  // app-credentials.cjs not generated yet (dev without running embed-env.cjs)
}

// Dome's GitHub OAuth App client id (public; OAuth App with Device Flow enabled).
// Priority: baked credential (packaged) → env (dev) → empty (not configured).
const CLIENT_ID = _appCredentials.DOME_GITHUB_CLIENT_ID || process.env.DOME_GITHUB_CLIENT_ID || '';

// Scopes: full repo access (issues, milestones, branches, releases) + org repos.
const SCOPES = 'repo read:org';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

const TOKEN_SETTING = 'github_oauth_token'; // ends with _token → stored encrypted
const LOGIN_SETTING = 'github_login';
const USER_AGENT = 'Dome-GitHub-Sync/1.0';

function getQueries() {
  return database.getQueries();
}

function setSetting(key, value) {
  getQueries().setSetting.run(key, value, Date.now());
}

function getSettingRaw(key) {
  try {
    return getQueries().getSetting.get(key)?.value || null;
  } catch {
    return null;
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json();
}

/**
 * Start the device-code flow. Returns the user code + verification URL to show
 * the user, plus the device code + polling parameters for pollForAccessToken().
 */
async function startDeviceFlow() {
  if (!CLIENT_ID) {
    throw new Error(
      'GitHub no configurado: falta DOME_GITHUB_CLIENT_ID (Client ID de una OAuth App con Device Flow activado).',
    );
  }
  const data = await fetchJson(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES }),
  });

  if (!data || typeof data !== 'object') throw new Error('Invalid device code response');
  const deviceCode = data.device_code;
  const userCode = data.user_code;
  const verificationUri = data.verification_uri;
  const interval = typeof data.interval === 'number' ? data.interval : 5;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 900;

  if (typeof deviceCode !== 'string' || typeof userCode !== 'string' || typeof verificationUri !== 'string') {
    throw new Error('Invalid device code response fields');
  }

  const parsed = new URL(verificationUri);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Untrusted verification_uri');
  }

  return { deviceCode, userCode, verificationUri: parsed.href, interval, expiresIn };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll GitHub until the user authorizes the device. On success the OAuth token
 * is stored encrypted in settings and { success: true, login } is returned.
 */
async function pollForAccessToken({ deviceCode, interval = 5, expiresIn = 900 } = {}) {
  if (typeof deviceCode !== 'string' || !deviceCode) {
    throw new Error('Missing device code');
  }
  let intervalMs = Math.max(interval, 1) * 1000;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    let raw;
    try {
      raw = await fetchJson(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
    } catch (err) {
      console.warn('[github-oauth] poll error:', err?.message || err);
      continue;
    }

    if (raw && typeof raw.access_token === 'string') {
      writeSettingSecret(getQueries(), TOKEN_SETTING, raw.access_token);
      const login = await fetchLogin(raw.access_token).catch(() => null);
      if (login) setSetting(LOGIN_SETTING, login);
      return { success: true, login };
    }
    if (raw && typeof raw.error === 'string') {
      if (raw.error === 'authorization_pending') continue;
      if (raw.error === 'slow_down') {
        intervalMs += 5000;
        continue;
      }
      throw new Error(`Device flow failed: ${raw.error}${raw.error_description ? `: ${raw.error_description}` : ''}`);
    }
  }
  throw new Error('Device flow timed out');
}

async function fetchLogin(token) {
  const data = await fetchJson(USER_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  return typeof data?.login === 'string' ? data.login : null;
}

/** Read the decrypted GitHub OAuth token (or null if not connected). */
function getToken() {
  return readSettingSecret(getQueries(), TOKEN_SETTING);
}

function getStatus() {
  return {
    connected: !!getToken(),
    login: getSettingRaw(LOGIN_SETTING) || null,
  };
}

function disconnect() {
  writeSettingSecret(getQueries(), TOKEN_SETTING, '');
  setSetting(LOGIN_SETTING, '');
  return { success: true };
}

module.exports = {
  startDeviceFlow,
  pollForAccessToken,
  getToken,
  getStatus,
  disconnect,
  USER_AGENT,
};
