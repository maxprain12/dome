import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_REMINDERS_JSON,
  normalizeRemindersForStorage,
  isRemindersJsonBloated,
} = require('../calendar/calendar-reminders.cjs');

describe('calendar-reminders', () => {
  it('passes array through as canonical JSON once', () => {
    assert.equal(normalizeRemindersForStorage([{ minutes: 30 }]), '[{"minutes":30}]');
  });

  it('does not double-stringify an already stored JSON string', () => {
    const once = DEFAULT_REMINDERS_JSON;
    assert.equal(normalizeRemindersForStorage(once), once);
    const twice = JSON.stringify(once);
    assert.equal(normalizeRemindersForStorage(twice), once);
  });

  it('peels deeply nested stringify corruption', () => {
    let corrupted = DEFAULT_REMINDERS_JSON;
    for (let i = 0; i < 5; i += 1) corrupted = JSON.stringify(corrupted);
    assert.equal(normalizeRemindersForStorage(corrupted), DEFAULT_REMINDERS_JSON);
  });

  it('detects bloated reminders', () => {
    assert.equal(isRemindersJsonBloated(DEFAULT_REMINDERS_JSON), false);
    assert.equal(isRemindersJsonBloated('x'.repeat(9000)), true);
  });
});
