'use strict';

/* eslint-disable no-console */

/**
 * ChatGPT Plus/Pro (Codex) OAuth for Dome (experimental).
 *
 * Uses `@dome/ai` device-code flow (`loginOpenAICodexDeviceCode`).
 * Credentials JSON (access, refresh, expires, accountId) stored encrypted
 * in settings (`openai_codex_oauth_credentials`).
 */

const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

const CREDENTIALS_SETTING = 'openai_codex_oauth_credentials';
const DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api';

/**
 * @param {import('../core/database.cjs')} database
 */
function getQueries(database) {
  return database.getQueries();
}

/**
 * @param {import('../core/database.cjs')} database
 * @returns {{ access: string, refresh: string, expires: number, accountId?: string } | null}
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
 * @param {{ access: string, refresh: string, expires: number, accountId?: string }} creds
 */
function writeCredentials(database, creds) {
  writeSettingSecret(
    getQueries(database),
    CREDENTIALS_SETTING,
    JSON.stringify({
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
      accountId: typeof creds.accountId === 'string' ? creds.accountId : undefined,
    }),
  );
}

async function loadOAuth() {
  return import('@dome/ai/oauth');
}

/**
 * Device-code login. Caller should open verification URI and show userCode from onDeviceCode.
 *
 * @param {import('../core/database.cjs')} database
 * @param {{ onDeviceCode?: (info: { userCode: string, verificationUri: string, intervalSeconds?: number, expiresInSeconds?: number }) => void }} [options]
 */
async function login(database, options = {}) {
  const { loginOpenAICodexDeviceCode } = await loadOAuth();
  const creds = await loginOpenAICodexDeviceCode({
    onDeviceCode: (info) => {
      options.onDeviceCode?.(info);
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
    throw new Error('ChatGPT (Codex) is not connected. Open Settings → AI and sign in.');
  }

  if (Date.now() >= creds.expires) {
    const { refreshOpenAICodexToken } = await loadOAuth();
    const refreshed = await refreshOpenAICodexToken(creds.refresh);
    creds = {
      access: refreshed.access,
      refresh: refreshed.refresh,
      expires: refreshed.expires,
      accountId:
        typeof refreshed.accountId === 'string'
          ? refreshed.accountId
          : creds.accountId,
    };
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
