/* eslint-disable no-console */
/**
 * Periodic Google Calendar sync (configurable interval via settings).
 */

const database = require('./database.cjs');

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

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
  return getSetting('calendar_sync_auto_enabled', 'true') === 'true';
}

function getIntervalMs() {
  const raw = parseInt(getSetting('calendar_sync_interval_minutes', '30'), 10);
  const mins = Number.isFinite(raw) && raw > 0 ? raw : 30;
  const ms = mins * 60 * 1000;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, ms));
}

async function tick() {
  if (!_windowManager || typeof _windowManager.broadcast !== 'function') return;
  if (!isAutoSyncEnabled()) return;

  const now = Date.now();
  const intervalMs = getIntervalMs();
  if (now - _lastTick < intervalMs - 2000) return;
  _lastTick = now;

  try {
    const calendarService = require('./calendar-service.cjs');
    const result = await calendarService.syncNow();
    if (result.success) {
      _windowManager.broadcast('calendar:syncStatus', {
        status: 'idle',
        lastSync: Date.now(),
        auto: true,
      });
    } else if (result.error) {
      _windowManager.broadcast('calendar:syncStatus', {
        status: 'error',
        error: result.error,
        auto: true,
      });
    }
  } catch (err) {
    console.error('[CalendarSyncScheduler] tick error:', err);
  }
}

function init(windowManager) {
  _windowManager = windowManager;
  if (_intervalId) clearInterval(_intervalId);
  if (_startupTimeoutId) clearTimeout(_startupTimeoutId);
  _intervalId = setInterval(tick, 60 * 1000);
  _startupTimeoutId = setTimeout(() => {
    _startupTimeoutId = null;
    void tick();
  }, 8000);
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

module.exports = {
  init,
  stop,
  getIntervalMs,
  isAutoSyncEnabled,
};
