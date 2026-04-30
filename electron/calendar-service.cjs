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

function isGoogleCalendarRow(cal) {
  return cal && cal.account_id && cal.account_id !== 'local';
}

function eventRowToGooglePayload(row) {
  let reminders = [];
  try {
    reminders = row.reminders ? JSON.parse(row.reminders) : [];
  } catch {
    reminders = [{ minutes: DEFAULT_REMINDER_MINUTES }];
  }
  return {
    title: row.title,
    description: row.description,
    location: row.location,
    start_at: row.start_at,
    end_at: row.end_at,
    timezone: row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    all_day: !!row.all_day,
    reminders,
  };
}

/**
 * Rebuild calendar_notifications rows for an event from reminders JSON + start_at.
 */
function rebuildNotificationsForEvent(eventId, startAt, remindersJson) {
  const q = database.getQueries();
  if (q.deleteCalendarNotificationsForEvent) {
    q.deleteCalendarNotificationsForEvent.run(eventId);
  }
  let reminders = [{ minutes: DEFAULT_REMINDER_MINUTES }];
  try {
    if (remindersJson) {
      const parsed = typeof remindersJson === 'string' ? JSON.parse(remindersJson) : remindersJson;
      if (Array.isArray(parsed) && parsed.length > 0) reminders = parsed;
    }
  } catch {
    /* keep default */
  }
  const now = Date.now();
  for (const r of reminders) {
    const minutes = typeof r.minutes === 'number' ? r.minutes : DEFAULT_REMINDER_MINUTES;
    const notifyAt = startAt - minutes * 60 * 1000;
    if (notifyAt <= now) continue;
    const nid = `caln-${eventId}-${notifyAt}`;
    try {
      q.createCalendarNotification.run(nid, eventId, notifyAt, null, now);
    } catch (e) {
      if (!String(e.message || '').includes('UNIQUE')) console.warn('[Calendar] notification insert:', e.message);
    }
  }
}

/**
 * Validate and parse event data for create/update
 */
function validateEventData(data, isUpdate = false) {
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
 * After local create, push to Google Calendar API if target calendar is Google-linked.
 */
async function pushCreatedEventToGoogle(eventId, cal, eventRow) {
  if (!isGoogleCalendarRow(cal)) return;
  const google = require('./google-calendar-service.cjs');
  const q = database.getQueries();
  const acc = q.getCalendarAccountById.get(cal.account_id);
  if (!acc || acc.provider !== 'google' || acc.status === 'disconnected') return;
  try {
    const payload = eventRowToGooglePayload(eventRow);
    const ge = await google.createGoogleEvent(acc.id, cal.remote_id, payload);
    if (ge?.id) {
      const now = Date.now();
      q.createCalendarEventLink.run(`link-${eventId}`, eventId, 'google', ge.id, cal.remote_id, now, now);
      q.updateCalendarEvent.run(
        eventRow.title,
        eventRow.description,
        eventRow.location,
        eventRow.start_at,
        eventRow.end_at,
        eventRow.timezone,
        eventRow.all_day,
        eventRow.status,
        eventRow.reminders,
        eventRow.metadata,
        'google',
        now,
        eventId
      );
    }
  } catch (err) {
    console.error('[Calendar] pushCreatedEventToGoogle:', err.message);
  }
}

async function pushUpdatedEventToGoogle(eventId, cal, eventRow) {
  if (!isGoogleCalendarRow(cal)) return;
  const q = database.getQueries();
  const link = q.getCalendarEventLinkByEvent.get(eventId);
  if (!link || link.provider !== 'google') return;
  const google = require('./google-calendar-service.cjs');
  const acc = q.getCalendarAccountById.get(cal.account_id);
  if (!acc || acc.provider !== 'google') return;
  try {
    const payload = eventRowToGooglePayload(eventRow);
    await google.updateGoogleEvent(acc.id, link.remote_calendar_id || cal.remote_id, link.remote_event_id, payload);
  } catch (err) {
    console.error('[Calendar] pushUpdatedEventToGoogle:', err.message);
  }
}

/**
 * Create a calendar event
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
    const remindersStr = p.reminders ?? JSON.stringify([{ minutes: DEFAULT_REMINDER_MINUTES }]);
    const metadataStr = data.metadata != null
      ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata))
      : null;

    const initialSource = isGoogleCalendarRow(cal) ? 'local' : 'local';

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
      remindersStr,
      metadataStr,
      initialSource,
      now,
      now
    );

    let event = q.getCalendarEventById.get(eventId);
    await pushCreatedEventToGoogle(eventId, cal, event);
    event = q.getCalendarEventById.get(eventId);
    rebuildNotificationsForEvent(eventId, event.start_at, event.reminders);

    return { success: true, event: rowToEvent({ ...event, calendar_title: cal?.title, calendar_color: cal?.color }) };
  } catch (err) {
    console.error('[Calendar] createEvent error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update an existing calendar event
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
    const cal = q.getCalendarCalendarById.get(existing.calendar_id);

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
      updates.metadata !== undefined
        ? (typeof updates.metadata === 'string' ? updates.metadata : JSON.stringify(updates.metadata))
        : existing.metadata,
      existing.source,
      now,
      eventId
    );

    let event = q.getCalendarEventById.get(eventId);
    await pushUpdatedEventToGoogle(eventId, cal, event);
    event = q.getCalendarEventById.get(eventId);
    rebuildNotificationsForEvent(eventId, event.start_at, event.reminders);

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

    const link = q.getCalendarEventLinkByEvent.get(eventId);
    const cal = q.getCalendarCalendarById.get(existing.calendar_id);
    if (link && link.provider === 'google' && cal && isGoogleCalendarRow(cal)) {
      const google = require('./google-calendar-service.cjs');
      try {
        await google.deleteGoogleEvent(cal.account_id, link.remote_calendar_id || cal.remote_id, link.remote_event_id);
      } catch (err) {
        console.warn('[Calendar] Google deleteEvent remote:', err.message);
      }
    }

    if (q.deleteCalendarNotificationsForEvent) {
      q.deleteCalendarNotificationsForEvent.run(eventId);
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
 */
async function listEvents(startMs, endMs, options = {}) {
  try {
    const q = database.getQueries();
    const db = database.getDB();
    const calendarIds = Array.isArray(options.calendarIds)
      ? options.calendarIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];

    let rows;
    if (calendarIds.length > 0) {
      const placeholders = calendarIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT e.*, c.title as calendar_title, c.color as calendar_color
        FROM calendar_events e
        JOIN calendar_calendars c ON e.calendar_id = c.id
        WHERE c.is_selected = 1 AND e.status != 'cancelled'
          AND e.start_at < ? AND e.end_at > ?
          AND e.calendar_id IN (${placeholders})
        ORDER BY e.start_at ASC
      `);
      rows = stmt.all(endMs, startMs, ...calendarIds);
    } else {
      rows = q.getCalendarEventsByRange.all(endMs, startMs);
    }
    const events = rows.map(rowToEvent);
    return { success: true, events };
  } catch (err) {
    console.error('[Calendar] listEvents error:', err);
    return { success: false, error: err.message, events: [] };
  }
}

/**
 * Get upcoming events within a time window
 */
async function getUpcomingEvents(windowMinutes = 10080, limit = 20) {
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

function rowToEvent(row) {
  if (!row) return null;
  const startAt = row.start_at;
  const endAt = row.end_at;
  return {
    id: row.id,
    calendar_id: row.calendar_id,
    calendar_title: row.calendar_title,
    calendar_color: row.calendar_color,
    title: row.title,
    description: row.description,
    location: row.location,
    start_at: startAt,
    end_at: endAt,
    /** ISO 8601 UTC — helps models answer “what day” without confusing epoch ms. */
    start_at_iso: startAt != null ? new Date(startAt).toISOString() : null,
    end_at_iso: endAt != null ? new Date(endAt).toISOString() : null,
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
        last_sync_at: r.last_sync_at,
      })),
    };
  } catch (err) {
    console.error('[Calendar] getGoogleAccounts error:', err);
    return { success: false, error: err.message, accounts: [] };
  }
}

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

function getCalendarSettings() {
  try {
    const q = database.getQueries();
    const get = (key, def) => q.getSetting?.get?.(key)?.value ?? def;
    return {
      success: true,
      settings: {
        sync_auto_enabled: get('calendar_sync_auto_enabled', 'true') !== 'false',
        sync_interval_minutes: Math.max(5, parseInt(get('calendar_sync_interval_minutes', '30'), 10) || 30),
        in_app_notifications_enabled: get('calendar_in_app_notifications_enabled', 'true') !== 'false',
        in_app_reminder_lead_minutes: Math.max(1, parseInt(get('calendar_in_app_reminder_lead_minutes', '15'), 10) || 15),
      },
    };
  } catch (err) {
    return { success: false, error: err.message, settings: {} };
  }
}

function setCalendarSettings(partial) {
  try {
    const q = database.getQueries();
    const now = Date.now();
    if (partial.sync_auto_enabled != null) {
      q.setSetting.run('calendar_sync_auto_enabled', partial.sync_auto_enabled ? 'true' : 'false', now);
    }
    if (partial.sync_interval_minutes != null) {
      const m = Math.min(24 * 60, Math.max(5, Number(partial.sync_interval_minutes) || 30));
      q.setSetting.run('calendar_sync_interval_minutes', String(m), now);
    }
    if (partial.in_app_notifications_enabled != null) {
      q.setSetting.run('calendar_in_app_notifications_enabled', partial.in_app_notifications_enabled ? 'true' : 'false', now);
    }
    if (partial.in_app_reminder_lead_minutes != null) {
      const lead = Math.min(7 * 24 * 60, Math.max(1, Number(partial.in_app_reminder_lead_minutes) || 15));
      q.setSetting.run('calendar_in_app_reminder_lead_minutes', String(lead), now);
    }
    return getCalendarSettings();
  } catch (err) {
    console.error('[Calendar] setCalendarSettings:', err);
    return { success: false, error: err.message };
  }
}

function setCalendarSelected(calendarId, isSelected) {
  try {
    const q = database.getQueries();
    const cal = q.getCalendarCalendarById.get(calendarId);
    if (!cal) return { success: false, error: 'Calendar not found' };
    q.updateCalendarCalendar.run(
      cal.title,
      cal.color,
      isSelected ? 1 : 0,
      cal.is_default,
      Date.now(),
      calendarId
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function disconnectGoogleAccount(accountId) {
  try {
    const q = database.getQueries();
    const acc = q.getCalendarAccountById.get(accountId);
    if (!acc || acc.provider !== 'google') {
      return { success: false, error: 'Not a Google calendar account' };
    }
    q.deleteCalendarAccount.run(accountId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

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
  getCalendarSettings,
  setCalendarSettings,
  setCalendarSelected,
  disconnectGoogleAccount,
  rebuildNotificationsForEvent,
};
