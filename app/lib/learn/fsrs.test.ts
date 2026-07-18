import { describe, expect, it } from 'vitest';
import { formatElapsed, formatInterval, previewIntervals, SRS_RATINGS } from './fsrs';

describe('Learn FSRS presentation helpers', () => {
  it('previews every persisted rating without mutating scheduling state', () => {
    const row = { stability: null, next_review_at: null, repetitions: 0 };
    const snapshot = { ...row };
    const intervals = previewIntervals(row, Date.UTC(2026, 0, 1));

    expect(Object.keys(intervals).map(Number)).toEqual(SRS_RATINGS);
    expect(intervals[1]).toBeGreaterThanOrEqual(0);
    expect(intervals[4]).toBeGreaterThan(intervals[1]);
    expect(row).toEqual(snapshot);
  });

  it('formats review and elapsed intervals at their boundaries', () => {
    expect(formatInterval(5 * 60_000)).toBe('<10min');
    expect(formatInterval(24 * 60 * 60_000)).toBe('1d');
    expect(formatElapsed(3_723_000)).toBe('1h 2m');
  });
});
