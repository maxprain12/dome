import type { PersistentRun } from '@/lib/automations/api';

export type DailyGoalId = 'write' | 'think' | 'build';

export interface DailyGoalItem {
  id: DailyGoalId;
  done: boolean;
  progress: number;
  progressLabel: string;
}

export interface DashboardStatsDeltas {
  resources: number;
  chats: number;
  dueCards: number;
  studioDocs: number;
  activeRuns: number;
}

export type PendingTagKind = 'warn' | 'running' | 'queued' | 'neutral';

/** SQLite timestamps may be seconds or milliseconds depending on source. */
export function toEpochMs(ts?: number | null): number {
  if (!ts || !Number.isFinite(ts)) return 0;
  return ts < 1e12 ? ts * 1000 : ts;
}

export function localDayKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDayMs(tsMs: number): number {
  const d = new Date(tsMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeStreak(activityDays: Set<string>): number {
  if (activityDays.size === 0) return 0;
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

export function computeMomentumPercent(params: {
  weeklyCreated: number;
  weeklyTouches: number;
  weeklyChats: number;
  weeklyRuns: number;
}): number {
  const raw =
    params.weeklyCreated * 6 +
    Math.min(params.weeklyTouches, 40) * 2 +
    params.weeklyChats * 5 +
    params.weeklyRuns * 8;
  return Math.min(100, Math.round(raw / 4));
}

export function computeWeeklyEnergyDelta(
  current: {
    weeklyCreated: number;
    weeklyTouches: number;
    weeklyChats: number;
    weeklyRuns: number;
  },
  previous: {
    weeklyCreated: number;
    weeklyTouches: number;
    weeklyChats: number;
    weeklyRuns: number;
  },
): number {
  return computeMomentumPercent(current) - computeMomentumPercent(previous);
}

export function countActiveRuns(runs: PersistentRun[]): number {
  return runs.filter(
    (r) => r.status === 'running' || r.status === 'waiting_approval' || r.status === 'queued',
  ).length;
}

export function buildDailyGoals(params: {
  resourcesCreatedToday: number;
  resourcesEditedToday: number;
  chatsToday: number;
  runsCompletedToday: number;
  activeRuns: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): DailyGoalItem[] {
  const writeDone = params.resourcesCreatedToday > 0 || params.resourcesEditedToday > 0;
  const thinkDone = params.chatsToday > 0;
  const buildDone = params.runsCompletedToday > 0;
  const buildPartial = !buildDone && params.activeRuns > 0;

  const writeLabel =
    params.resourcesEditedToday > 0
      ? params.t(
          params.resourcesEditedToday === 1
            ? 'dashboard.goal_progress_edits'
            : 'dashboard.goal_progress_edits_plural',
          { count: params.resourcesEditedToday },
        )
      : params.resourcesCreatedToday > 0
        ? params.t('dashboard.goal_progress_created', { count: params.resourcesCreatedToday })
        : params.t('dashboard.goal_progress_none');

  const thinkLabel =
    params.chatsToday > 0
      ? params.t('dashboard.goal_progress_messages', { count: params.chatsToday })
      : params.t('dashboard.goal_progress_none');

  const buildLabel = buildDone
    ? params.t('dashboard.goal_progress_runs_done', { count: params.runsCompletedToday })
    : buildPartial
      ? params.t('dashboard.goal_progress_runs_active', {
          active: params.activeRuns,
          total: params.activeRuns,
        })
      : params.t('dashboard.goal_progress_none');

  return [
    {
      id: 'write',
      done: writeDone,
      progress: writeDone ? 100 : 0,
      progressLabel: writeLabel,
    },
    {
      id: 'think',
      done: thinkDone,
      progress: thinkDone ? 100 : 0,
      progressLabel: thinkLabel,
    },
    {
      id: 'build',
      done: buildDone,
      progress: buildDone ? 100 : 0,
      progressLabel: buildLabel,
    },
  ];
}

export function formatPendingTime(tsMs: number): { time: string; ampm: string } {
  const d = new Date(tsMs);
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'am' : 'pm';
  return {
    time: `${hour12}:${String(m).padStart(2, '0')}`,
    ampm,
  };
}

export function pendingTagForEvent(
  startMs: number,
  nowMs: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { tag: string; tagKind: PendingTagKind; isNow: boolean } {
  const diffMin = Math.round((startMs - nowMs) / 60000);
  const endWindow = 60 * 60 * 1000;
  const isNow = startMs <= nowMs && nowMs < startMs + endWindow;

  if (isNow) {
    return { tag: t('dashboard.tag_now'), tagKind: 'running', isNow: true };
  }
  if (diffMin > 0 && diffMin <= 120) {
    return {
      tag: t('dashboard.tag_in_hours', { count: Math.max(1, Math.round(diffMin / 60)) }),
      tagKind: 'warn',
      isNow: false,
    };
  }
  return { tag: '', tagKind: 'neutral', isNow: false };
}

export function pendingTagForRun(
  status: string,
  t: (key: string) => string,
): { tag: string; tagKind: PendingTagKind } {
  if (status === 'waiting_approval') {
    return { tag: t('dashboard.tag_approve'), tagKind: 'queued' };
  }
  if (status === 'running') {
    return { tag: t('dashboard.tag_running'), tagKind: 'running' };
  }
  if (status === 'queued') {
    return { tag: t('dashboard.tag_queued'), tagKind: 'queued' };
  }
  return { tag: '', tagKind: 'neutral' };
}
