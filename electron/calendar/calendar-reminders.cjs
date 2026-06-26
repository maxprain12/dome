'use strict';

/**
 * Normalize calendar event reminders for SQLite storage.
 *
 * Bug: updateEvent merges DB rows into validateEventData, where `reminders` is
 * already a JSON string. JSON.stringify(string) double-encodes on every GitHub
 * calendar sync tick → exponential growth (~256MB/event) → OOM + multi-GB DB.
 */

const DEFAULT_REMINDER_MINUTES = 15;
const DEFAULT_REMINDERS_JSON = JSON.stringify([{ minutes: DEFAULT_REMINDER_MINUTES }]);

/** Stored reminders JSON should stay tiny; anything larger is corruption. */
const MAX_REMINDERS_JSON_CHARS = 8192;

/**
 * @param {unknown} value
 * @returns {string | undefined} canonical JSON string, or undefined when absent
 */
function normalizeRemindersForStorage(value) {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_REMINDERS_JSON;
    try {
      let parsed = JSON.parse(trimmed);
      // Peel onion layers from historical double-stringify corruption.
      let depth = 0;
      while (typeof parsed === 'string' && depth < 32) {
        parsed = JSON.parse(parsed);
        depth += 1;
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map((r) => ({
          minutes:
            typeof r?.minutes === 'number' && Number.isFinite(r.minutes)
              ? r.minutes
              : DEFAULT_REMINDER_MINUTES,
        }));
        return JSON.stringify(normalized);
      }
    } catch {
      /* fall through to reset */
    }
    return DEFAULT_REMINDERS_JSON;
  }

  if (Array.isArray(value)) {
    const normalized = value.map((r) => ({
      minutes:
        typeof r?.minutes === 'number' && Number.isFinite(r.minutes)
          ? r.minutes
          : DEFAULT_REMINDER_MINUTES,
    }));
    return JSON.stringify(normalized.length > 0 ? normalized : [{ minutes: DEFAULT_REMINDER_MINUTES }]);
  }

  return DEFAULT_REMINDERS_JSON;
}

/**
 * @param {string | null | undefined} remindersJson
 * @param {{ thresholdChars?: number }} [opts]
 */
function isRemindersJsonBloated(remindersJson, opts = {}) {
  const threshold =
    typeof opts.thresholdChars === 'number' && opts.thresholdChars > 0
      ? opts.thresholdChars
      : MAX_REMINDERS_JSON_CHARS;
  return typeof remindersJson === 'string' && remindersJson.length > threshold;
}

module.exports = {
  DEFAULT_REMINDER_MINUTES,
  DEFAULT_REMINDERS_JSON,
  MAX_REMINDERS_JSON_CHARS,
  normalizeRemindersForStorage,
  isRemindersJsonBloated,
};
