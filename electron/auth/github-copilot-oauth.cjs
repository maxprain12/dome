'use strict';

/* eslint-disable no-console */

/**
 * GitHub Copilot OAuth (device-code flow) for Dome.
 *
 * Flow:
 *  1. startDeviceFlow() — ask GitHub for a device/user code.
 *  2. The user opens the verification URL and types the user code.
 *  3. pollForAccessToken() — poll until GitHub returns a long-lived OAuth token;
 *     that token is persisted in settings (`copilot_github_token`).
 *  4. getCopilotToken() — exchange the OAuth token for a short-lived Copilot
 *     token (cached in-memory) used as the Bearer for api.*.githubcopilot.com.
 *
 * Constants/endpoints mirror the editor integration used by packages/ai.
 */

// "Iv1.b507a08c87ecfe98" — the well-known GitHub Copilot (editor) client id.
const CLIENT_ID = Buffer.from('SXYxLmI1MDdhMDhjODdlY2ZlOTg=', 'base64').toString('utf8');

const COPILOT_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
};

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const DEFAULT_BASE_URL = 'https://api.individual.githubcopilot.com';

const GH_TOKEN_SETTING = 'copilot_github_token';

/** @type {{ token: string, baseUrl: string, expires: number } | null} */
let cachedCopilotToken = null;

async function getSetting(database, key) {
  try {
    return (await database.getQueries().getSetting.get(key))?.value || null;
  } catch {
    return null;
  }
}

async function setSetting(database, key, value) {
  await database.getQueries().setSetting.run(key, value, Date.now());
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
  const data = await fetchJson(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': COPILOT_HEADERS['User-Agent'],
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: 'read:user' }),
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

  // Guard against a non-http verification URI.
  const parsed = new URL(verificationUri);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Untrusted verification_uri');
  }

  return { deviceCode, userCode, verificationUri: parsed.href, interval, expiresIn };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll GitHub until the user authorizes the device. On success the long-lived
 * OAuth token is stored in settings and { success: true } is returned.
 */
async function pollForAccessToken(database, { deviceCode, interval = 5, expiresIn = 900 } = {}) {
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
          'User-Agent': COPILOT_HEADERS['User-Agent'],
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
    } catch (err) {
      // Transient network error: keep polling until the deadline.
      console.warn('[copilot-oauth] poll error:', err?.message || err);
      continue;
    }

    if (raw && typeof raw.access_token === 'string') {
      await setSetting(database, GH_TOKEN_SETTING, raw.access_token);
      cachedCopilotToken = null;
      return { success: true };
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

/**
 * Token format includes `proxy-ep=proxy.<host>` — convert it to the API host.
 */
function getBaseUrlFromToken(token) {
  const match = /proxy-ep=([^;]+)/.exec(token);
  if (!match) return DEFAULT_BASE_URL;
  return `https://${match[1].replace(/^proxy\./, 'api.')}`;
}

/**
 * Exchange the stored GitHub OAuth token for a short-lived Copilot token.
 * Cached in-memory until shortly before expiry.
 * @returns {Promise<{ token: string, baseUrl: string }>}
 */
async function getCopilotToken(database) {
  if (cachedCopilotToken && cachedCopilotToken.expires > Date.now() + 60_000) {
    return { token: cachedCopilotToken.token, baseUrl: cachedCopilotToken.baseUrl };
  }

  const ghToken = await getSetting(database, GH_TOKEN_SETTING);
  if (!ghToken) {
    throw new Error('GitHub Copilot no conectado. Conéctalo en Ajustes → IA.');
  }

  const raw = await fetchJson(COPILOT_TOKEN_URL, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${ghToken}`, ...COPILOT_HEADERS },
  });
  if (!raw || typeof raw.token !== 'string' || typeof raw.expires_at !== 'number') {
    throw new Error('Invalid Copilot token response');
  }

  const baseUrl = getBaseUrlFromToken(raw.token);
  cachedCopilotToken = {
    token: raw.token,
    baseUrl,
    expires: raw.expires_at * 1000 - 5 * 60 * 1000,
  };
  return { token: raw.token, baseUrl };
}

async function getStatus(database) {
  return { connected: !!(await getSetting(database, GH_TOKEN_SETTING)) };
}

async function disconnect(database) {
  await setSetting(database, GH_TOKEN_SETTING, '');
  cachedCopilotToken = null;
  return { success: true };
}

module.exports = {
  startDeviceFlow,
  pollForAccessToken,
  getCopilotToken,
  getStatus,
  disconnect,
  COPILOT_HEADERS,
};
