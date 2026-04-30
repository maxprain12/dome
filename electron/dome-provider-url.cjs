/* eslint-disable no-console */
/**
 * Resolved base URL for Dome Provider (OAuth + /api/v1).
 *
 * Precedence:
 * 1. process.env.DOME_PROVIDER_URL (dev / overrides)
 * 2. electron/app-credentials.cjs DOME_PROVIDER_URL (CI embed-env)
 * 3. Packaged app: https://provider.dome.app
 * 4. Unpacked dev: http://localhost:3001 (aligns with dome-provider APP_URL default)
 */
function getDomeProviderBaseUrl() {
  const env = (process.env.DOME_PROVIDER_URL || '').trim();
  if (env) return env;

  try {
    const creds = require('./app-credentials.cjs');
    const baked = (creds.DOME_PROVIDER_URL || '').trim();
    if (baked) return baked;
  } catch (_) {
    // app-credentials.cjs absent (dev without embed-env)
  }

  try {
    const { app } = require('electron');
    if (app?.isPackaged) return 'https://provider.dome.app';
  } catch (_) {
    // non-Electron context
  }

  return 'http://localhost:3001';
}

module.exports = { getDomeProviderBaseUrl };
