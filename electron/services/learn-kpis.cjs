/* eslint-disable no-console */
/**
 * Learn KPIs / streak.
 *
 * Activity (streak, time studied) is sourced from the unified `study_events`
 * table so BOTH flashcard sessions and quiz runs count. Results are cached per
 * scope for the current local day and invalidated whenever a new study event is
 * recorded (see invalidateLearnKpisCache).
 */

function localDayKey(tsMs) {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDayMs(tsMs) {
  const d = new Date(tsMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeStreak(activityDays) {
  if (!activityDays || activityDays.size === 0) return 0;
  const todayStart = startOfLocalDayMs(Date.now());
  let streak = 0;
  let cursor = todayStart;
  let allowSkipFirstGap = true;

  for (let i = 0; i < 365; i++) {
    const key = localDayKey(cursor);
    if (activityDays.has(key)) {
      streak++;
      allowSkipFirstGap = false;
      cursor -= 86400000;
    } else if (allowSkipFirstGap && streak === 0) {
      cursor -= 86400000;
      allowSkipFirstGap = false;
    } else {
      break;
    }
  }
  return streak;
}

function computeLongestStreak(activityDays) {
  if (!activityDays || activityDays.size === 0) return 0;
  const sorted = [...activityDays].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`);
    const cur = new Date(`${sorted[i]}T12:00:00`);
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return longest;
}

/** Days (local) with any study activity (flashcard OR quiz) in the last ~year. */
async function collectActivityDays(db) {
  const activityDays = new Set();
  const since = Date.now() - 366 * 86400000;
  const rows = await db.all('SELECT started_at FROM study_events WHERE started_at >= ?', [since]);
  for (const row of rows) {
    if (row.started_at) activityDays.add(localDayKey(row.started_at));
  }
  return activityDays;
}

async function getLearnKpis(db) {
  const now = Date.now();
  const todayStart = startOfLocalDayMs(now);
  const yesterdayStart = todayStart - 86400000;

  const dueToday =
    (await db.get(
      'SELECT COUNT(*) as n FROM flashcards WHERE next_review_at IS NULL OR next_review_at <= ?',
      [now],
    ))?.n ?? 0;

  const dueYesterday =
    (await db.get(
      'SELECT COUNT(*) as n FROM flashcards WHERE (next_review_at IS NULL OR next_review_at <= ?) AND created_at < ?',
      [yesterdayStart, todayStart],
    ))?.n ?? 0;

  // FSRS mastery: a card is "mastered" once its memory stability (days) is high.
  const masteryRow = await db.get(`
      SELECT AVG(CASE WHEN total > 0 THEN CAST(mastered AS REAL) / total ELSE 0 END) * 100 as pct
      FROM (
        SELECT deck_id,
          SUM(CASE WHEN COALESCE(stability, interval) >= 21 THEN 1 ELSE 0 END) as mastered,
          COUNT(*) as total
        FROM flashcards GROUP BY deck_id
      )
    `);
  const masteryGlobal = Math.round(masteryRow?.pct ?? 0);

  // Time studied today: flashcards + quizzes
  const timeTodayMs =
    (await db.get('SELECT COALESCE(SUM(duration_ms), 0) as ms FROM study_events WHERE started_at >= ?', [
      todayStart,
    ]))?.ms ?? 0;

  const activityDays = await collectActivityDays(db);
  const streakDays = computeStreak(activityDays);
  const longestStreak = computeLongestStreak(activityDays);

  return {
    dueToday,
    dueTodayDelta: dueToday - dueYesterday,
    masteryGlobal,
    masteryDelta: 0,
    streakDays,
    longestStreak,
    timeTodayMs,
    timeTodayGoalMs: 20 * 60 * 1000,
  };
}

async function getLearnStreak(db) {
  const now = Date.now();
  const activityDays = await collectActivityDays(db);
  const streakDays = computeStreak(activityDays);
  const dueToday =
    (await db.get(
      'SELECT COUNT(*) as n FROM flashcards WHERE next_review_at IS NULL OR next_review_at <= ?',
      [now],
    ))?.n ?? 0;

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const todayDow = today.getDay();
  const days = [];

  for (let i = 0; i < 7; i++) {
    const offset = i - todayDow;
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = localDayKey(d.getTime());
    days.push({
      label: dayLabels[d.getDay()],
      done: activityDays.has(key),
      today: offset === 0,
    });
  }

  return { days, dueToday, streakDays };
}

// ---- Same-day cache (table: learn_kpis_cache) -----------------------------

/** Return cached payload only if it was computed during the current local day. */
async function readFreshCache(db, scope) {
  try {
    const row = await db.get('SELECT payload, computed_at FROM learn_kpis_cache WHERE scope = ?', [scope]);
    if (!row) return null;
    if (localDayKey(row.computed_at) !== localDayKey(Date.now())) return null;
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

async function writeCache(db, scope, payload) {
  try {
    await db.run(
      `INSERT INTO learn_kpis_cache (scope, payload, computed_at) VALUES (?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at`,
      [scope, JSON.stringify(payload), Date.now()],
    );
  } catch {
    /* cache table may not exist on very old schema — ignore */
  }
}

async function getLearnKpisCached(db) {
  const cached = await readFreshCache(db, 'kpis');
  if (cached) return cached;
  const data = await getLearnKpis(db);
  await writeCache(db, 'kpis', data);
  return data;
}

async function getLearnStreakCached(db) {
  const cached = await readFreshCache(db, 'streak');
  if (cached) return cached;
  const data = await getLearnStreak(db);
  await writeCache(db, 'streak', data);
  return data;
}

/** Drop cached KPIs/streak — call after any study event or card mutation. */
async function invalidateLearnKpisCache(db) {
  try {
    await db.run('DELETE FROM learn_kpis_cache');
  } catch {
    /* ignore */
  }
}

module.exports = {
  localDayKey,
  startOfLocalDayMs,
  computeStreak,
  computeLongestStreak,
  getLearnKpis,
  getLearnStreak,
  getLearnKpisCached,
  getLearnStreakCached,
  invalidateLearnKpisCache,
};
