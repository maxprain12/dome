/* eslint-disable no-console */
/**
 * Calendar Service - Main Process
 * Handles calendar events CRUD, sync orchestration, and upcoming events.
 * Provider-specific sync (Google) is delegated to google-calendar-service.cjs.
 */

const crypto = require('crypto');
const database = require('./database.cjs');

const DEFAULT_REMINDER_MINUTES = 15;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_EVENTS_PER_QUERY = 500;

/**
 * Generate a unique event ID
 */
function generateEventId() {
  return `evt-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get default calendar ID (local or first selected)
 */
function getDefaultCalendarId() {
  const q = database.getQueries();
  const row = q.getDefaultCalendar.get();
  if (row) return row.id;
  return 'local-default';
}

/**
 * Validate and parse event data for create/update
 */
function validateEventData(data, isUpdate = false) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid data format' };
  }
  if (!isUpdate && (!data.title || typeof data.title !== 'string')) {
    return { valid: false, error: 'Title is required' };
  }
  const title = (data.title || '').trim();
  if (title.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title exceeds maximum length of ${MAX_TITLE_LENGTH}` };
  }
  if (data.description && data.description.length > MAX_DESCRIPTION_LENGTH) {
    return { valid: false, error: `Description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH}` };
  }

  let startAt = null;
  let endAt = null;
  if (data.start_at != null) {
    startAt = new Date(data.start_at).getTime();
    if (Number.isNaN(startAt)) {
      return { valid: false, error: 'Invalid start_at format (use ISO 8601)' };
    }
  }
  if (data.end_at != null) {
    endAt = new Date(data.end_at).getTime();
    if (Number.isNaN(endAt)) {
      return { valid: false, error: 'Invalid end_at format (use ISO 8601)' };
    }
  }
  if (startAt != null && endAt != null && endAt <= startAt) {
    return { valid: false, error: 'end_at must be after start_at' };
  }

  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const tenYearsAhead = now + 10 * 365 * 24 * 60 * 60 * 1000;
  if (startAt != null && (startAt < oneYearAgo || startAt > tenYearsAhead)) {
    return { valid: false, error: 'Start time is outside acceptable range (1 year past to 10 years future)' };
  }
  if (startAt != null && endAt != null && (endAt - startAt) > 365 * 24 * 60 * 60 * 1000) {
    return { valid: false, error: 'Event duration cannot exceed 1 year' };
  }

  return {
    valid: true,
    parsed: {
      title: title || (isUpdate ? undefined : 'Untitled'),
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      start_at: startAt ?? data.start_at,
      end_at: endAt ?? data.end_at,
      timezone: data.timezone ?? undefined,
      all_day: data.all_day ? 1 : 0,
      reminders: data.reminders != null ? JSON.stringify(data.reminders) : undefined,
    },
  };
}

/**
 * Create a calendar event
 * @param {Object} data - Event data
 * @returns {Promise<{ success: boolean, event?: Object, error?: string }>}
 */
async function createEvent(data) {
  try {
    const validation = validateEventData(data, false);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const q = database.getQueries();
    const calendarId = data.calendar_id || getDefaultCalendarId();
    const cal = q.getCalendarCalendarById.get(calendarId);
    if (!cal) {
      return { success: false, error: 'Calendar not found' };
    }

    const eventId = data.idempotency_key
      ? `evt-${crypto.createHash('sha256').update(data.idempotency_key).digest('hex').slice(0, 16)}-${Date.now()}`
      : generateEventId();

    const now = Date.now();
    const p = validation.parsed;
    const startAt = p.start_at ?? now;
    const endAt = p.end_at ?? startAt + 60 * 60 * 1000;

    q.createCalendarEvent.run(
      eventId,
      calendarId,
      p.title || 'Untitled',
      p.description ?? null,
      p.location ?? null,
      startAt,
      endAt,
      p.timezone ?? null,
      p.all_day ?? 0,
      'confirmed',
      p.reminders ?? JSON.stringify([{ minutes: DEFAULT_REMINDER_MINUTES }]),
      null,
      'local',
      now,
      now
    );

    const event = q.getCalendarEventById.get(eventId);
    return { success: true, event: rowToEvent({ ...event, calendar_title: cal?.title, calendar_color: cal?.color }) };
  } catch (err) {
    console.error('[Calendar] createEvent error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update a calendar event
 */
async function updateEvent(eventId, updates) {
  try {
    const q = database.getQueries();
    const existing = q.getCalendarEventById.get(eventId);
    if (!existing) {
      return { success: false, error: 'Event not found' };
    }

    const validation = validateEventData({ ...existing, ...updates }, true);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const p = validation.parsed;
    const now = Date.now();

    q.updateCalendarEvent.run(
      p.title ?? existing.title,
      p.description ?? existing.description,
      p.location ?? existing.location,
      p.start_at ?? existing.start_at,
      p.end_at ?? existing.end_at,
      p.timezone ?? existing.timezone,
      p.all_day ?? existing.all_day,
      updates.status ?? existing.status,
      p.reminders ?? existing.reminders,
      updates.metadata ?? existing.metadata,
      existing.source,
      now,
      eventId
    );

    const event = q.getCalendarEventById.get(eventId);
    return { success: true, event: rowToEvent(event) };
  } catch (err) {
    console.error('[Calendar] updateEvent error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a calendar event
 */
async function deleteEvent(eventId) {
  try {
    const q = database.getQueries();
    const existing = q.getCalendarEventById.get(eventId);
    if (!existing) {
      return { success: false, error: 'Event not found' };
    }

    q.deleteCalendarEventLinksByEvent.run(eventId);
    q.deleteCalendarEvent.run(eventId);
    return { success: true, deleted: true };
  } catch (err) {
    console.error('[Calendar] deleteEvent error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * List events in a time range
 * @param {number} startMs - Start of range (ms)
 * @param {number} endMs - End of range (ms)
 * @param {Object} options - { calendarIds?: string[] }
 */
async function listEvents(startMs, endMs, options = {}) {
  try {
    const q = database.getQueries();
    const rows = q.getCalendarEventsByRange.all(endMs, startMs);
    const events = rows.map(rowToEvent);
    return { success: true, events };
  } catch (err) {
    console.error('[Calendar] listEvents error:', err);
    return { success: false, error: err.message, events: [] };
  }
}

/**
 * Get upcoming events within a time window
 * @param {number} windowMinutes - Minutes from now to look ahead (default 60)
 * @param {number} limit - Max events to return (default 20)
 */
async function getUpcomingEvents(windowMinutes = 60, limit = 20) {
  try {
    const now = Date.now();
    const endMs = now + windowMinutes * 60 * 1000;
    const q = database.getQueries();
    const rows = q.getUpcomingCalendarEvents.all(now, endMs, Math.min(limit, 50));
    const events = rows.map(rowToEvent);
    return { success: true, events };
  } catch (err) {
    console.error('[Calendar] getUpcomingEvents error:', err);
    return { success: false, error: err.message, events: [] };
  }
}

/**
 * Convert DB row to event object for API
 */
function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    calendar_id: row.calendar_id,
    calendar_title: row.calendar_title,
    calendar_color: row.calendar_color,
    title: row.title,
    description: row.description,
    location: row.location,
    start_at: row.start_at,
    end_at: row.end_at,
    timezone: row.timezone,
    all_day: !!row.all_day,
    status: row.status,
    reminders: row.reminders ? JSON.parse(row.reminders) : [],
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * List connected Google Calendar accounts (for UI - no credentials)
 */
function getGoogleAccounts() {
  try {
    const q = database.getQueries();
    const rows = q.getCalendarAccountsByProvider?.all?.('google') ?? [];
    return {
      success: true,
      accounts: rows.map((r) => ({
        id: r.id,
        account_email: r.account_email,
        status: r.status,
      })),
    };
  } catch (err) {
    console.error('[Calendar] getGoogleAccounts error:', err);
    return { success: false, error: err.message, accounts: [] };
  }
}

/**
 * List calendars (for UI and sync)
 */
function listCalendars(accountId = null) {
  try {
    const q = database.getQueries();
    let rows;
    if (accountId) {
      rows = q.getCalendarCalendarsByAccount.all(accountId);
    } else {
      rows = q.getSelectedCalendarCalendars.all();
    }
    return {
      success: true,
      calendars: rows.map((r) => ({
        id: r.id,
        account_id: r.account_id,
        remote_id: r.remote_id,
        title: r.title,
        color: r.color,
        is_selected: !!r.is_selected,
        is_default: !!r.is_default,
      })),
    };
  } catch (err) {
    console.error('[Calendar] listCalendars error:', err);
    return { success: false, error: err.message, calendars: [] };
  }
}

/**
 * Placeholder for sync - will be implemented by google-calendar-service
 */
async function syncNow() {
  try {
    const googleService = require('./google-calendar-service.cjs');
    if (googleService && typeof googleService.syncAll === 'function') {
      return await googleService.syncAll();
    }
    return { success: true, synced: false, message: 'No external calendars connected' };
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return { success: true, synced: false, message: 'No external calendars connected' };
    }
    console.error('[Calendar] syncNow error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  getUpcomingEvents,
  getGoogleAccounts,
  listCalendars,
  syncNow,
  getDefaultCalendarId,
  rowToEvent,
};
