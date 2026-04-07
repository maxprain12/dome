/* eslint-disable no-console */
/**
 * Import calendar events from ICS files (VEVENT blocks).
 */

const fs = require('fs');
const crypto = require('crypto');
const database = require('./database.cjs');
const calendarService = require('./calendar-service.cjs');

function parseIcsDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (m[4] != null) {
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const se = Number(m[6]);
    return Date.UTC(y, mo, d, h, mi, se);
  }
  return Date.UTC(y, mo, d, 0, 0, 0);
}

function unfoldIcsLines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function extractVevents(icsText) {
  const unfolded = unfoldIcsLines(icsText);
  const events = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
  let m;
  while ((m = re.exec(unfolded)) !== null) {
    events.push(m[1]);
  }
  return events;
}

function parseVeventBlock(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const props = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const keyPart = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = keyPart.split(';')[0].toUpperCase();
    if (!props[key]) props[key] = [];
    props[key].push(value);
  }
  const uid = props.UID?.[0] || '';
  const summary = props.SUMMARY?.[0] || 'Imported event';
  const desc = props.DESCRIPTION?.[0] || '';
  const loc = props.LOCATION?.[0] || '';
  const dtStartRaw = props.DTSTART?.[0] || '';
  const dtEndRaw = props.DTEND?.[0] || '';
  const startAt = parseIcsDate(dtStartRaw);
  let endAt = parseIcsDate(dtEndRaw);
  const allDay = !String(dtStartRaw).includes('T');
  if (startAt != null && endAt == null) {
    endAt = startAt + (allDay ? 86400000 : 3600000);
  }
  return {
    uid,
    title: summary,
    description: desc,
    location: loc,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
  };
}

function fingerprint(ev) {
  const h = crypto.createHash('sha256');
  h.update(
    JSON.stringify({
      t: ev.title,
      s: ev.start_at,
      e: ev.end_at,
      u: ev.uid,
    }),
  );
  return h.digest('hex').slice(0, 16);
}

function parseMetadata(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

/**
 * Preview ICS file without writing to DB.
 */
function previewIcsFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const blocks = extractVevents(raw);
  const events = [];
  for (const b of blocks) {
    const ev = parseVeventBlock(b);
    if (ev.start_at == null || ev.end_at == null) continue;
    events.push({
      ...ev,
      fingerprint: fingerprint(ev),
    });
  }
  return { events, rawCount: blocks.length };
}

function loadExistingFingerprintsForCalendar(calendarId, startMs, endMs) {
  const db = database.getDB();
  const rows = db
    .prepare(
      `SELECT title, start_at, end_at, metadata FROM calendar_events
       WHERE calendar_id = ? AND status != 'cancelled'
         AND start_at < ? AND end_at > ?`,
    )
    .all(calendarId, endMs, startMs);
  const set = new Set();
  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    set.add(
      fingerprint({
        title: row.title,
        start_at: row.start_at,
        end_at: row.end_at,
        uid: meta.import_uid || '',
      }),
    );
  }
  return set;
}

/**
 * Import events into a calendar.
 */
async function importIcsFile(filePath, calendarId, options = {}) {
  const { skipDuplicates = true } = options;
  const preview = previewIcsFile(filePath);
  const rangeStart = Date.now() - 86400000 * 365 * 2;
  const rangeEnd = Date.now() + 86400000 * 365 * 2;
  const existingFp = loadExistingFingerprintsForCalendar(calendarId, rangeStart, rangeEnd);
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const ev of preview.events) {
    if (skipDuplicates && existingFp.has(ev.fingerprint)) {
      skipped++;
      continue;
    }
    try {
      const meta = { import_uid: ev.uid, import_source: 'ics' };
      const result = await calendarService.createEvent({
        calendar_id: calendarId,
        title: ev.title,
        description: ev.description || undefined,
        location: ev.location || undefined,
        start_at: ev.start_at,
        end_at: ev.end_at,
        all_day: ev.all_day,
        reminders: [{ minutes: 15 }],
        metadata: meta,
      });
      if (!result.success) {
        errors.push(result.error || 'createEvent failed');
        continue;
      }
      existingFp.add(ev.fingerprint);
      imported++;
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }
  return {
    imported,
    skipped,
    totalParsed: preview.events.length,
    errors,
  };
}

module.exports = {
  previewIcsFile,
  importIcsFile,
};
