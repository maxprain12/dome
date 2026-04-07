/* eslint-disable no-console */
/**
 * Calendar Notification Service
 * Periodically checks for upcoming events and broadcasts to renderer (in-app reminders).
 */

const calendarService = require('./calendar-service.cjs');

const TICK_INTERVAL_MS = 60 * 1000;
const MAX_EVENTS = 20;

let _windowManager = null;
let _intervalId = null;
/** @type {Set<string>} */
const _dedupeKeys = new Set();

function getLeadMinutes() {
  try {
    const r = calendarService.getCalendarSettings();
    if (r.success && r.settings?.in_app_reminder_lead_minutes != null) {
      return Math.max(1, Number(r.settings.in_app_reminder_lead_minutes) || 15);
    }
  } catch {
    /* ignore */
  }
  return 15;
}

function inAppEnabled() {
  try {
    const r = calendarService.getCalendarSettings();
    if (r.success && r.settings?.in_app_notifications_enabled === false) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Initialize the notification service
 * @param {Object} windowManager - Window manager for broadcasting
 */
function init(windowManager) {
  _windowManager = windowManager;
  if (_intervalId) {
    clearInterval(_intervalId);
  }
  _intervalId = setInterval(tick, TICK_INTERVAL_MS);
  tick();
}

/**
 * Stop the notification service
 */
function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _dedupeKeys.clear();
}

/**
 * Check for upcoming events and broadcast to all windows
 */
async function tick() {
  if (!_windowManager || typeof _windowManager.broadcast !== 'function') return;
  if (!inAppEnabled()) return;

  try {
    const lead = getLeadMinutes();
    const result = await calendarService.getUpcomingEvents(lead, MAX_EVENTS);
    if (!result.success || !result.events || result.events.length === 0) return;

    const toEmit = [];
    for (const ev of result.events) {
      const key = `${ev.id}:${ev.start_at}`;
      if (_dedupeKeys.has(key)) continue;
      _dedupeKeys.add(key);
      toEmit.push(ev);
    }

    if (toEmit.length === 0) return;

    _windowManager.broadcast('calendar:upcoming', {
      events: toEmit,
      leadMinutes: lead,
      inApp: true,
    });

    if (_dedupeKeys.size > 500) {
      const arr = [..._dedupeKeys];
      _dedupeKeys.clear();
      for (const k of arr.slice(-200)) _dedupeKeys.add(k);
    }
  } catch (err) {
    console.error('[CalendarNotification] tick error:', err);
  }
}

module.exports = {
  init,
  stop,
};
