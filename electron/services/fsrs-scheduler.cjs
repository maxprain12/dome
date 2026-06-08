/* eslint-disable no-console */
/**
 * FSRS scheduler (main process).
 *
 * Wraps `ts-fsrs` (the modern Free Spaced Repetition Scheduler that superseded
 * SM-2 in Anki) and adapts it to Dome's `flashcards` table shape. All scheduling
 * math lives here so IPC handlers stay thin and the legacy SM-2 code can be
 * removed.
 *
 * Rating scale (matches the renderer's 4 buttons and ts-fsrs `Rating`):
 *   1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 *
 * FSRS card state (ts-fsrs `State`):
 *   0 = New, 1 = Learning, 2 = Review, 3 = Relearning
 */
const {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
} = require('ts-fsrs');

const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic scheduling (fuzz disabled) so previews match what gets persisted.
const DEFAULT_RETENTION = 0.9;
let _engine = null;
function getEngine() {
  if (!_engine) {
    _engine = fsrs(
      generatorParameters({ enable_fuzz: false, request_retention: DEFAULT_RETENTION }),
    );
  }
  return _engine;
}

const VALID_RATINGS = new Set([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);

/**
 * Convert a DB flashcard row into a ts-fsrs Card object.
 * Cards that have never been scheduled by FSRS (no stability) start as empty/New.
 * @param {object} row flashcard DB row
 * @param {Date} now
 */
function rowToCard(row, now) {
  const hasFsrs = row && typeof row.stability === 'number' && row.stability > 0;
  if (!hasFsrs) {
    const empty = createEmptyCard(now);
    // Preserve a prior due date if the legacy scheduler set one.
    if (row && row.next_review_at) empty.due = new Date(row.next_review_at);
    return empty;
  }
  return {
    due: new Date(row.next_review_at || now.getTime()),
    stability: row.stability,
    difficulty: row.fsrs_difficulty,
    elapsed_days: 0, // ts-fsrs recomputes from last_review
    scheduled_days: row.scheduled_days || 0,
    reps: row.repetitions || 0,
    lapses: row.lapses || 0,
    learning_steps: row.learning_steps || 0,
    state: typeof row.fsrs_state === 'number' ? row.fsrs_state : State.New,
    last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
  };
}

/**
 * Map a scheduled ts-fsrs Card back to the DB columns we persist.
 * Includes a legacy mirror (`interval`) so any old read path keeps working.
 * @param {import('ts-fsrs').Card} card
 * @param {number} nowMs
 * @param {1|2|3|4} rating
 */
function cardToColumns(card, nowMs, rating) {
  return {
    stability: card.stability,
    fsrs_difficulty: card.difficulty,
    fsrs_state: card.state,
    lapses: card.lapses,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps || 0,
    repetitions: card.reps,
    next_review_at: card.due.getTime(),
    last_reviewed_at: nowMs,
    last_rating: rating,
    interval: card.scheduled_days, // legacy mirror
  };
}

/**
 * Schedule a card after a review.
 * @param {object} row flashcard DB row
 * @param {number} rating 1..4 (Again/Hard/Good/Easy)
 * @param {number} [nowMs]
 * @returns {object} columns to persist (see cardToColumns)
 */
function schedule(row, rating, nowMs = Date.now()) {
  const r = Math.max(1, Math.min(4, Math.round(rating)));
  if (!VALID_RATINGS.has(r)) {
    throw new Error(`Invalid FSRS rating: ${rating}`);
  }
  const now = new Date(nowMs);
  const card = rowToCard(row, now);
  const result = getEngine().repeat(card, now)[r];
  return cardToColumns(result.card, nowMs, r);
}

/**
 * Preview the next interval for all four ratings (drives the SRS buttons).
 * @param {object} row flashcard DB row
 * @param {number} [nowMs]
 * @returns {{ [rating:number]: { dueAt:number, intervalMs:number } }}
 */
function previewIntervals(row, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const card = rowToCard(row, now);
  const rec = getEngine().repeat(card, now);
  const out = {};
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const dueAt = rec[r].card.due.getTime();
    out[r] = { dueAt, intervalMs: Math.max(0, dueAt - nowMs) };
  }
  return out;
}

/**
 * Derive initial FSRS state from legacy SM-2 fields (used by migration 38 backfill).
 * Returns null for never-reviewed cards so they stay New.
 * @param {object} row flashcard DB row with legacy ease_factor/interval/repetitions
 * @returns {object|null} columns to set, or null to leave as New
 */
function backfillFromLegacy(row) {
  const reps = Number(row.repetitions) || 0;
  const interval = Number(row.interval) || 0;
  const reviewed = reps > 0 || row.last_reviewed_at != null;
  if (!reviewed) return null;

  // Stability ≈ the interval at which retrievability ≈ request_retention.
  const stability = Math.max(0.5, interval || 1);

  // Map SM-2 ease (1.3 easy-floor .. 2.5 default) to FSRS difficulty (1 easy .. 10 hard).
  const ef = Number(row.ease_factor) || 2.5;
  const efNorm = Math.max(0, Math.min(1, (ef - 1.3) / (2.5 - 1.3)));
  const difficulty = Math.max(1, Math.min(10, 10 - efNorm * 9));

  const state = interval >= 1 ? State.Review : State.Learning;

  return {
    stability: Math.round(stability * 1e4) / 1e4,
    fsrs_difficulty: Math.round(difficulty * 1e4) / 1e4,
    fsrs_state: state,
    lapses: 0,
    scheduled_days: interval,
    learning_steps: 0,
  };
}

const MASTERED_STABILITY_DAYS = 21;

module.exports = {
  schedule,
  previewIntervals,
  backfillFromLegacy,
  rowToCard,
  DAY_MS,
  MASTERED_STABILITY_DAYS,
  RATING: { AGAIN: Rating.Again, HARD: Rating.Hard, GOOD: Rating.Good, EASY: Rating.Easy },
  STATE: { NEW: State.New, LEARNING: State.Learning, REVIEW: State.Review, RELEARNING: State.Relearning },
};
