'use strict';

/* eslint-disable no-console */

/**
 * Claude Pro/Max OAuth for Dome (experimental).
 *
 * Wraps `@dome/ai` `loginAnthropic` / `refreshAnthropicToken` (PKCE + localhost:53692).
 * Credentials JSON is stored encrypted in settings (`claude_oauth_credentials`).
 */

const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

const CREDENTIALS_SETTING = 'claude_oauth_credentials';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/**
 * @param {import('../core/database.cjs')} database
 */
function getQueries(database) {
  return database.getQueries();
}

/**
 * @param {import('../core/database.cjs')} database
 * @returns {{ access: string, refresh: string, expires: number } | null}
 */
function readCredentials(database) {
  const raw = readSettingSecret(getQueries(database), CREDENTIALS_SETTING);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.access === 'string' &&
      typeof parsed.refresh === 'string' &&
      typeof parsed.expires === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {import('../core/database.cjs')} database
 * @param {{ access: string, refresh: string, expires: number }} creds
 */
function writeCredentials(database, creds) {
  writeSettingSecret(
    getQueries(database),
    CREDENTIALS_SETTING,
    JSON.stringify({
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    }),
  );
}

async function loadOAuth() {
  return import('@dome/ai/oauth');
}

/**
 * Run Claude Pro/Max PKCE login. Opens the browser via onAuth callback (caller should openExternal).
 *
 * @param {import('../core/database.cjs')} database
 * @param {{ onAuth?: (info: { url: string }) => void }} [options]
 */
async function login(database, options = {}) {
  const { loginAnthropic } = await loadOAuth();
  const creds = await loginAnthropic({
    onAuth: (info) => {
      options.onAuth?.(info);
    },
    onPrompt: async () => {
      throw new Error(
        'OAuth callback not received on localhost:53692. Complete login in the browser and try again.',
      );
    },
    onProgress: (message) => {
      console.log('[claude-oauth]', message);
    },
  });
  writeCredentials(database, creds);
  return { success: true };
}

/**
 * @param {import('../core/database.cjs')} database
 * @returns {Promise<{ token: string, baseUrl: string }>}
 */
async function getAccessToken(database) {
  let creds = readCredentials(database);
  if (!creds) {
    throw new Error('Claude Pro/Max is not connected. Open Settings → AI and sign in.');
  }

  if (Date.now() >= creds.expires) {
    const { refreshAnthropicToken } = await loadOAuth();
    creds = await refreshAnthropicToken(creds.refresh);
    writeCredentials(database, creds);
  }

  return { token: creds.access, baseUrl: DEFAULT_BASE_URL };
}

/**
 * @param {import('../core/database.cjs')} database
 */
function getStatus(database) {
  return { connected: !!readCredentials(database) };
}

/**
 * @param {import('../core/database.cjs')} database
 */
function disconnect(database) {
  writeSettingSecret(getQueries(database), CREDENTIALS_SETTING, '');
  return { success: true };
}

module.exports = {
  login,
  getAccessToken,
  getStatus,
  disconnect,
  CREDENTIALS_SETTING,
  DEFAULT_BASE_URL,
};
