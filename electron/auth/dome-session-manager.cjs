/* eslint-disable no-console */
'use strict';

const { app } = require('electron');
const domeOauth = require('./dome-oauth.cjs');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;
let refreshTimer = null;
let databaseRef = null;
let windowManagerRef = null;

function broadcastSessionState(state) {
  try {
    windowManagerRef?.broadcast?.('domeauth:sessionState', state);
  } catch {
    /* */
  }
}

async function refreshSessionIfNeeded() {
  if (!databaseRef) return;
  try {
    const session = await domeOauth.getOrRefreshSession(databaseRef);
    broadcastSessionState({
      connected: Boolean(session?.connected),
      userId: session?.userId ?? null,
      expiresAt: session?.expiresAt ?? null,
    });
    return session;
  } catch (err) {
    console.warn('[DomeSessionManager] refresh failed:', err?.message);
    broadcastSessionState({ connected: false, error: err?.message });
    return { connected: false };
  }
}

/**
 * Unified HTTP client for all dome-provider API calls.
 * @param {string} path - e.g. `/api/v1/me/quota`
 * @param {RequestInit} [options]
 */
async function domeFetch(path, options = {}) {
  if (!databaseRef) throw new Error('DomeSessionManager not initialized');
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return domeOauth.fetchWithDomeAuth(databaseRef, url, options);
}

function startDomeSessionManager(database, windowManager) {
  databaseRef = database;
  windowManagerRef = windowManager;

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    void refreshSessionIfNeeded();
  }, REFRESH_INTERVAL_MS);

  void refreshSessionIfNeeded();

  if (app && !app._domeSessionActivateHook) {
    app.on('activate', () => {
      void refreshSessionIfNeeded();
    });
    app._domeSessionActivateHook = true;
  }
}

function stopDomeSessionManager() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = {
  startDomeSessionManager,
  stopDomeSessionManager,
  refreshSessionIfNeeded,
  domeFetch,
};
