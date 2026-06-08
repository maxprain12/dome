/**
 * FSRS interval preview (renderer side).
 *
 * Mirrors `electron/services/fsrs-scheduler.cjs` so the four study buttons
 * (Again / Hard / Good / Easy) can show the next review interval without an IPC
 * round-trip. The main process remains the source of truth for what gets
 * persisted; this only previews using the card's current FSRS fields.
 */
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';

/** Subset of a flashcard DB row needed for scheduling. */
export interface FlashcardSrsRow {
  stability?: number | null;
  fsrs_difficulty?: number | null;
  fsrs_state?: number | null;
  lapses?: number | null;
  scheduled_days?: number | null;
  learning_steps?: number | null;
  repetitions?: number | null;
  next_review_at?: number | null;
  last_reviewed_at?: number | null;
}

export type SrsRating = 1 | 2 | 3 | 4;
export const SRS_RATINGS: SrsRating[] = [1, 2, 3, 4];
/** UI labels in rating order (Again/Hard/Good/Easy). */
export const SRS_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const;

let _engine: ReturnType<typeof fsrs> | null = null;
function getEngine() {
  if (!_engine) {
    _engine = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));
  }
  return _engine;
}

function rowToCard(row: FlashcardSrsRow, now: Date): FsrsCard {
  const hasFsrs = typeof row.stability === 'number' && row.stability > 0;
  if (!hasFsrs) {
    const empty = createEmptyCard(now);
    if (row.next_review_at) empty.due = new Date(row.next_review_at);
    return empty;
  }
  return {
    due: new Date(row.next_review_at || now.getTime()),
    stability: row.stability as number,
    difficulty: row.fsrs_difficulty as number,
    elapsed_days: 0,
    scheduled_days: row.scheduled_days || 0,
    reps: row.repetitions || 0,
    lapses: row.lapses || 0,
    learning_steps: row.learning_steps || 0,
    state: (typeof row.fsrs_state === 'number' ? row.fsrs_state : State.New) as State,
    last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
  };
}

const RATING_MAP: Record<SrsRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/** Preview the next interval (ms from now) for every rating. */
export function previewIntervals(
  row: FlashcardSrsRow,
  nowMs: number = Date.now(),
): Record<SrsRating, number> {
  const now = new Date(nowMs);
  const rec = getEngine().repeat(rowToCard(row, now), now);
  const out = {} as Record<SrsRating, number>;
  for (const r of SRS_RATINGS) {
    const dueAt = rec[RATING_MAP[r]].card.due.getTime();
    out[r] = Math.max(0, dueAt - nowMs);
  }
  return out;
}

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Compact, human label for a future interval (used on SRS buttons).
 * Localized units are passed in by the caller (i18n) with sensible English defaults.
 */
export function formatInterval(
  ms: number,
  units: { min?: string; h?: string; d?: string; mo?: string; y?: string } = {},
): string {
  const u = { min: 'min', h: 'h', d: 'd', mo: 'mo', y: 'y', ...units };
  if (ms < 10 * MIN_MS) return `<10${u.min}`;
  if (ms < HOUR_MS) return `${Math.round(ms / MIN_MS)}${u.min}`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}${u.h}`;
  if (ms < MONTH_MS) return `${Math.round(ms / DAY_MS)}${u.d}`;
  if (ms < YEAR_MS) return `${Math.round(ms / MONTH_MS)}${u.mo}`;
  return `${(ms / YEAR_MS).toFixed(1)}${u.y}`;
}

/** Format an elapsed duration in ms as "1m 23s" / "45s" / "2h 5m". */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
