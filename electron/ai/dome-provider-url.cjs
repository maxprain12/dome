/* eslint-disable no-console */
/**
 * Resolved base URL for Dome Provider (OAuth + /api/v1).
 *
 * Precedence:
 * 1. process.env.DOME_PROVIDER_URL (dev / overrides)
 * 2. electron/app-credentials.cjs DOME_PROVIDER_URL (CI embed-env)
 * 3. Packaged app: https://dome-provider.dowi.es (current Coolify/preprod host)
 * 4. Unpacked dev: http://localhost:3001 (aligns with dome-provider APP_URL default)
 */
const PACKAGED_DOME_PROVIDER_URL = 'https://dome-provider.dowi.es';
const DEV_DOME_PROVIDER_URL = 'http://localhost:3001';

function getDomeProviderBaseUrl() {
  const env = (process.env.DOME_PROVIDER_URL || '').trim();
  if (env) return env;

  try {
    const creds = require('../app-credentials.cjs');
    const baked = (creds.DOME_PROVIDER_URL || '').trim();
    if (baked) return baked;
  } catch (_) {
    // app-credentials.cjs absent (dev without embed-env)
  }

  try {
    const { app } = require('electron');
    if (app?.isPackaged) return PACKAGED_DOME_PROVIDER_URL;
  } catch (_) {
    // non-Electron context
  }

  return DEV_DOME_PROVIDER_URL;
}

module.exports = { getDomeProviderBaseUrl, PACKAGED_DOME_PROVIDER_URL, DEV_DOME_PROVIDER_URL };
