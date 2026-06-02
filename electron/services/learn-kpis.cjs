/* eslint-disable no-console */

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

function collectActivityDays(db) {
  const activityDays = new Set();
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;

  const sessions = db
    .prepare('SELECT started_at FROM flashcard_sessions WHERE started_at >= ?')
    .all(weekAgo - 365 * 86400000);
  for (const row of sessions) {
    if (row.started_at) activityDays.add(localDayKey(row.started_at));
  }

  const reviews = db
    .prepare('SELECT last_reviewed_at FROM flashcards WHERE last_reviewed_at IS NOT NULL AND last_reviewed_at >= ?')
    .all(weekAgo - 365 * 86400000);
  for (const row of reviews) {
    if (row.last_reviewed_at) activityDays.add(localDayKey(row.last_reviewed_at));
  }

  return activityDays;
}

function getLearnKpis(db) {
  const now = Date.now();
  const todayStart = startOfLocalDayMs(now);
  const yesterdayStart = todayStart - 86400000;

  const dueToday =
    db.prepare('SELECT COUNT(*) as n FROM flashcards WHERE next_review_at IS NOT NULL AND next_review_at <= ?').get(now)
      ?.n ?? 0;

  const dueYesterday =
    db
      .prepare(
        'SELECT COUNT(*) as n FROM flashcards WHERE next_review_at IS NOT NULL AND next_review_at <= ? AND next_review_at > ?',
      )
      .get(yesterdayStart, yesterdayStart - 86400000)?.n ?? 0;

  const masteryRow = db
    .prepare(
      `
      SELECT
        AVG(CASE WHEN total > 0 THEN CAST(mastered AS REAL) / total ELSE 0 END) * 100 as pct
      FROM (
        SELECT
          deck_id,
          SUM(CASE WHEN interval >= 21 THEN 1 ELSE 0 END) as mastered,
          COUNT(*) as total
        FROM flashcards
        GROUP BY deck_id
      )
    `,
    )
    .get();

  const masteryGlobal = Math.round(masteryRow?.pct ?? 0);

  const timeTodayMs =
    db.prepare('SELECT COALESCE(SUM(duration_ms), 0) as ms FROM flashcard_sessions WHERE started_at >= ?').get(todayStart)
      ?.ms ?? 0;

  const activityDays = collectActivityDays(db);
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

function getLearnStreak(db) {
  const now = Date.now();
  const activityDays = collectActivityDays(db);
  const streakDays = computeStreak(activityDays);
  const dueToday =
    db.prepare('SELECT COUNT(*) as n FROM flashcards WHERE next_review_at IS NOT NULL AND next_review_at <= ?').get(now)
      ?.n ?? 0;

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

module.exports = {
  localDayKey,
  startOfLocalDayMs,
  computeStreak,
  computeLongestStreak,
  getLearnKpis,
  getLearnStreak,
};
