'use strict';

/* eslint-disable no-console */

/**
 * Periodic GitHub sync (configurable interval via settings).
 * Mirrors electron/calendar/calendar-sync-scheduler.cjs.
 */

const database = require('../core/database.cjs');

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MIN = 15;
const STARTUP_DELAY_MS = 120 * 1000;

let _windowManager = null;
let _intervalId = null;
let _startupTimeoutId = null;
let _lastTick = 0;

function getSetting(key, defaultValue) {
  try {
    const row = database.getQueries().getSetting?.get?.(key);
    if (row?.value != null && row.value !== '') return row.value;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

function isAutoSyncEnabled() {
  return getSetting('github_sync_auto_enabled', 'true') === 'true';
}

async function isConnected() {
  try {
    return (await require("../auth/github-oauth.cjs").getStatus()).connected;
  } catch {
    return false;
  }
}

function getIntervalMs() {
  const raw = parseInt(getSetting('github_sync_interval_minutes', String(DEFAULT_INTERVAL_MIN)), 10);
  const mins = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MIN;
  const ms = mins * 60 * 1000;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, ms));
}

async function tick() {
  // Startup/periodic GitHub sync pulls large API payloads; skip in dev to avoid V8 Zone OOM on low-RAM machines.
  if (process.env.NODE_ENV === 'development') return;
  if (!isAutoSyncEnabled() || !(await isConnected())) return;

  const now = Date.now();
  const intervalMs = getIntervalMs();
  if (now - _lastTick < intervalMs - 2000) return;
  _lastTick = now;

  try {
    const syncService = require('./github-sync-service.cjs');
    await syncService.syncNow();
  } catch (err) {
    console.error('[github-sync-scheduler] tick error:', err?.message || err);
  }
}

function init(windowManager) {
  _windowManager = windowManager;
  stop();
  // Light recurring check; tick() self-throttles to the configured interval.
  _intervalId = setInterval(() => void tick(), 60 * 1000);
  _startupTimeoutId = setTimeout(() => void tick(), STARTUP_DELAY_MS);
}

function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_startupTimeoutId) {
    clearTimeout(_startupTimeoutId);
    _startupTimeoutId = null;
  }
}

module.exports = { init, stop, tick };
