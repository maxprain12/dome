/* eslint-disable no-console */
/**
 * Calendar Notification Service
 * Periodically checks for upcoming events and broadcasts to renderer.
 */

const calendarService = require('./calendar-service.cjs');

const TICK_INTERVAL_MS = 60 * 1000; // 1 minute
const UPCOMING_WINDOW_MINUTES = 15;
const MAX_EVENTS = 20;

let _windowManager = null;
let _intervalId = null;

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
}

/**
 * Check for upcoming events and broadcast to all windows
 */
async function tick() {
  if (!_windowManager || typeof _windowManager.broadcast !== 'function') return;

  try {
    const result = await calendarService.getUpcomingEvents(UPCOMING_WINDOW_MINUTES, MAX_EVENTS);
    if (result.success && result.events && result.events.length > 0) {
      _windowManager.broadcast('calendar:upcoming', { events: result.events });
    }
  } catch (err) {
    console.error('[CalendarNotification] tick error:', err);
  }
}

module.exports = {
  init,
  stop,
};
