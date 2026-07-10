import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '@/lib/db/client';
import { listRuns, onRunUpdated } from '@/lib/automations/api';
import type { PersistentRun } from '@/lib/automations/api';
import {
  buildDailyGoals,
  computeMomentumPercent,
  computeStreak,
  computeWeeklyEnergyDelta,
  countActiveRuns,
  formatPendingTime,
  localDayKey,
  pendingTagForEvent,
  pendingTagForRun,
  startOfLocalDayMs,
  toEpochMs,
} from '@/lib/hooks/dashboardGamification';
import type { DailyGoalItem, DashboardStatsDeltas, PendingTagKind } from '@/lib/hooks/dashboardGamification';
export type { DashboardStatsDeltas, DailyGoalItem, DailyGoalId, PendingTagKind } from '@/lib/hooks/dashboardGamification';

export interface DashboardStats {
  resourceCount: number;
  studioCount: number;
  dueFlashcards: number;
  upcomingEvents: number;
  recentChats: number;
  activeRuns: number;
}

export type ActivityKind = 'resource' | 'chat';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle?: string;
  timestamp: number;
  resourceId?: string;
  resourceType?: string;
  sessionId?: string;
}

/** Evento próximo para el home (subset del calendario) */
export interface DashboardUpcomingEvent {
  id: string;
  title: string;
  start_at: number;
  calendar_color?: string;
}

/** Métricas gamificadas derivadas de uso reciente */
export interface HomeGamification {
  streakDays: number;
  /** 0–100, resumen de actividad en la última semana */
  momentumPercent: number;
  weeklyEnergyDelta: number;
  dailyGoalTarget: number;
  dailyGoalProgress: number;
  dailyGoals: DailyGoalItem[];
  weeklyResourcesCreated: number;
  weeklyResourceTouches: number;
  weeklyChatSessions: number;
  weeklyRunsCompleted: number;
  pendingTodayCount: number;
}

export type PendingTodayKind = 'flashcards' | 'calendar' | 'run';

export interface PendingTodayItem {
  id: string;
  kind: PendingTodayKind;
  title: string;
  subtitle?: string;
  refId?: string;
  timestamp: number;
  timeLabel?: string;
  ampm?: string;
  tag?: string;
  tagKind?: PendingTagKind;
  isNow?: boolean;
}

export interface DashboardData {
  stats: DashboardStats;
  statsDeltas: DashboardStatsDeltas;
  activity: ActivityItem[];
  runs: PersistentRun[];
  upcomingEventsList: DashboardUpcomingEvent[];
  gamification: HomeGamification;
  activityDayCounts: Record<string, number>;
  pendingToday: PendingTodayItem[];
  loading: boolean;
  refresh: () => void;
}

const EMPTY_STATS: DashboardStats = {
  resourceCount: 0,
  studioCount: 0,
  dueFlashcards: 0,
  upcomingEvents: 0,
  recentChats: 0,
  activeRuns: 0,
};

const EMPTY_DELTAS: DashboardStatsDeltas = {
  resources: 0,
  chats: 0,
  dueCards: 0,
  studioDocs: 0,
  activeRuns: 0,
};

const EMPTY_GAMIFICATION: HomeGamification = {
  streakDays: 0,
  momentumPercent: 0,
  weeklyEnergyDelta: 0,
  dailyGoalTarget: 3,
  dailyGoalProgress: 0,
  dailyGoals: [],
  weeklyResourcesCreated: 0,
  weeklyResourceTouches: 0,
  weeklyChatSessions: 0,
  weeklyRunsCompleted: 0,
  pendingTodayCount: 0,
};

const BACKGROUND_RELOAD_DEBOUNCE_MS = 800;

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

interface DashboardResource {
  id: string;
  title: string;
  type: string;
  project_id: string;
  created_at?: number;
  updated_at: number;
  metadata?: string | Record<string, unknown>;
}

interface DashboardChatSession {
  id: string;
  resource_id: string | null;
  created_at: number;
  updated_at: number;
}

interface DashboardTimeWindows {
  nowMs: number;
  startToday: number;
  endToday: number;
  weekStartMs: number;
  prevWeekStartMs: number;
}

/** Shared accumulator for streak days and per-day activity counts. */
interface ActivityTally {
  activityDays: Set<string>;
  dayCountMap: Record<string, number>;
}

function makeTimeWindows(nowMs: number): DashboardTimeWindows {
  const startToday = startOfLocalDayMs(nowMs);
  return {
    nowMs,
    startToday,
    endToday: startToday + 86400000,
    weekStartMs: nowMs - 7 * 86400000,
    prevWeekStartMs: nowMs - 14 * 86400000,
  };
}

function bumpDay(tally: ActivityTally, key: string): void {
  if (!key) return;
  tally.dayCountMap[key] = (tally.dayCountMap[key] ?? 0) + 1;
}

function okArray<T>(res: { success?: boolean; data?: unknown } | null | undefined): T[] {
  return res?.success && Array.isArray(res.data) ? (res.data as T[]) : [];
}

async function fetchStudioRows(
  scopedPid: string,
): Promise<{ rows: Array<{ created_at?: number; updated_at?: number }>; count: number }> {
  if (!window.electron?.db?.studio?.getByProject) return { rows: [], count: 0 };
  const studioResult = await window.electron.db.studio.getByProject(scopedPid).catch(() => null);
  const rows = okArray<{ created_at?: number; updated_at?: number }>(studioResult);
  return { rows, count: rows.length };
}

async function countDueFlashcards(decks: Array<{ id: string }>): Promise<number> {
  if (!window.electron?.db?.flashcards?.getStats || decks.length === 0) return 0;
  const deckStats = await Promise.all(
    decks.map((deck) =>
      window.electron.db.flashcards.getStats(deck.id).catch(() => null),
    ),
  );
  return deckStats.reduce((sum, r) => {
    if (!r?.success || !r.data) return sum;
    return sum + Number(r.data.due_cards || 0) + Number(r.data.new_cards || 0);
  }, 0);
}

function tallyStudioRows(
  studioRows: Array<{ created_at?: number; updated_at?: number }>,
  tally: ActivityTally,
  weekStartMs: number,
): number {
  let studioCreatedThisWeek = 0;
  for (const row of studioRows) {
    const cMs = toEpochMs(row.created_at ?? row.updated_at);
    const uMs = toEpochMs(row.updated_at ?? row.created_at);
    tally.activityDays.add(localDayKey(cMs));
    if (uMs !== cMs) tally.activityDays.add(localDayKey(uMs));
    bumpDay(tally, localDayKey(cMs));
    if (localDayKey(uMs) !== localDayKey(cMs)) bumpDay(tally, localDayKey(uMs));
    if (cMs >= weekStartMs) studioCreatedThisWeek++;
  }
  return studioCreatedThisWeek;
}

async function tallyFlashcardSessions(
  decks: Array<{ id: string }>,
  tally: ActivityTally,
  weekStartMs: number,
): Promise<number> {
  if (!window.electron?.db?.flashcards?.getSessions || decks.length === 0) return 0;
  const sessionResults = await Promise.all(
    decks.map((deck) =>
      window.electron.db.flashcards.getSessions(deck.id, 120).catch(() => null),
    ),
  );
  let cardsStudiedThisWeek = 0;
  for (const result of sessionResults) {
    const sessions =
      result?.success && Array.isArray(result.data) ? result.data : [];
    for (const session of sessions) {
      const st = toEpochMs(session.started_at);
      tally.activityDays.add(localDayKey(st));
      bumpDay(tally, localDayKey(st));
      if (st >= weekStartMs) {
        cardsStudiedThisWeek += Number(session.cards_studied ?? 0);
      }
    }
  }
  return cardsStudiedThisWeek;
}

function tallyResources(
  resources: DashboardResource[],
  tally: ActivityTally,
  tw: DashboardTimeWindows,
) {
  let weeklyResourcesCreated = 0;
  let weeklyResourceTouches = 0;
  let resourcesCreatedToday = 0;
  let resourcesEditedToday = 0;
  let resourcesCreatedThisWeek = 0;
  let prevWeeklyResourcesCreated = 0;
  let prevWeeklyResourceTouches = 0;
  for (const r of resources) {
    const cMs = toEpochMs(r.created_at ?? r.updated_at);
    const uMs = toEpochMs(r.updated_at);
    tally.activityDays.add(localDayKey(cMs));
    tally.activityDays.add(localDayKey(uMs));
    bumpDay(tally, localDayKey(cMs));
    const uk = localDayKey(uMs);
    if (uk !== localDayKey(cMs)) bumpDay(tally, uk);
    else if (uMs > cMs + 1000) bumpDay(tally, uk);
    if (cMs >= tw.weekStartMs) weeklyResourcesCreated++;
    if (uMs >= tw.weekStartMs) weeklyResourceTouches++;
    if (cMs >= tw.startToday && cMs < tw.endToday) resourcesCreatedToday++;
    if (uMs >= tw.startToday && uMs < tw.endToday && uMs > cMs + 30 * 1000) resourcesEditedToday++;
    if (cMs >= tw.weekStartMs) resourcesCreatedThisWeek++;
    else if (cMs >= tw.prevWeekStartMs && cMs < tw.weekStartMs) prevWeeklyResourcesCreated++;
    if (uMs >= tw.prevWeekStartMs && uMs < tw.weekStartMs) prevWeeklyResourceTouches++;
  }
  return {
    weeklyResourcesCreated,
    weeklyResourceTouches,
    resourcesCreatedToday,
    resourcesEditedToday,
    resourcesCreatedThisWeek,
    prevWeeklyResourcesCreated,
    prevWeeklyResourceTouches,
  };
}

function tallyChats(
  chats: DashboardChatSession[],
  tally: ActivityTally,
  tw: DashboardTimeWindows,
) {
  let chatsToday = 0;
  let weeklyChatSessions = 0;
  let chatsThisWeek = 0;
  let prevWeeklyChatSessions = 0;
  for (const s of chats) {
    const ca = toEpochMs(s.created_at);
    const ua = toEpochMs(s.updated_at ?? s.created_at);
    tally.activityDays.add(localDayKey(ca));
    tally.activityDays.add(localDayKey(ua));
    bumpDay(tally, localDayKey(ca));
    const uak = localDayKey(ua);
    if (uak !== localDayKey(ca)) bumpDay(tally, uak);
    const maxTs = Math.max(ca, ua);
    if (maxTs >= tw.weekStartMs) weeklyChatSessions++;
    if (ua >= tw.startToday && ua < tw.endToday) chatsToday++;
    if (maxTs >= tw.weekStartMs) chatsThisWeek++;
    else if (maxTs >= tw.prevWeekStartMs && maxTs < tw.weekStartMs) prevWeeklyChatSessions++;
  }
  return { chatsToday, weeklyChatSessions, chatsThisWeek, prevWeeklyChatSessions };
}

function tallyRuns(
  runs: PersistentRun[],
  tally: ActivityTally,
  tw: DashboardTimeWindows,
) {
  let runsCompletedToday = 0;
  let weeklyRunsCompleted = 0;
  let prevWeeklyRunsCompleted = 0;
  let runsStartedThisWeek = 0;
  for (const run of runs) {
    const startedAt = toEpochMs(run.startedAt);
    const finished = toEpochMs(run.finishedAt ?? run.updatedAt);
    const updatedAt = toEpochMs(run.updatedAt);
    tally.activityDays.add(localDayKey(startedAt));
    tally.activityDays.add(localDayKey(updatedAt));
    if (run.finishedAt) tally.activityDays.add(localDayKey(finished));
    bumpDay(tally, localDayKey(startedAt));
    if (run.finishedAt) bumpDay(tally, localDayKey(finished));
    if (startedAt >= tw.weekStartMs) runsStartedThisWeek++;
    if (run.status === 'completed') {
      if (finished >= tw.weekStartMs) weeklyRunsCompleted++;
      if (finished >= tw.startToday && finished < tw.endToday) runsCompletedToday++;
      if (finished >= tw.prevWeekStartMs && finished < tw.weekStartMs) prevWeeklyRunsCompleted++;
    }
  }
  return { runsCompletedToday, weeklyRunsCompleted, prevWeeklyRunsCompleted, runsStartedThisWeek };
}

function buildPendingToday(args: {
  dueFlashcards: number;
  eventsRaw: DashboardUpcomingEvent[];
  runs: PersistentRun[];
  tw: DashboardTimeWindows;
  t: TranslateFn;
}): PendingTodayItem[] {
  const { dueFlashcards, eventsRaw, runs, tw, t } = args;
  const pending: PendingTodayItem[] = [];
  if (dueFlashcards > 0) {
    const tagInfo = { tag: t('dashboard.tag_study'), tagKind: 'warn' as PendingTagKind };
    pending.push({
      id: 'pending-flashcards',
      kind: 'flashcards',
      title: t('dashboard.pending_flashcards', { count: dueFlashcards }),
      subtitle: t('dashboard.pending_flashcards_sub'),
      timestamp: tw.nowMs,
      ...formatPendingTime(tw.nowMs),
      ...tagInfo,
    });
  }
  for (const ev of eventsRaw) {
    const st = toEpochMs(ev.start_at);
    if (st >= tw.startToday && st < tw.endToday + 86400000) {
      const { time, ampm } = formatPendingTime(st);
      const tagInfo = pendingTagForEvent(st, tw.nowMs, t);
      pending.push({
        id: `pending-cal-${ev.id}`,
        kind: 'calendar',
        title: ev.title || t('dashboard.pending_event'),
        subtitle: t('dashboard.pending_calendar_sub'),
        refId: ev.id,
        timestamp: st,
        timeLabel: time,
        ampm,
        ...tagInfo,
      });
    }
  }
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'waiting_approval' || run.status === 'queued') {
      const updatedAt = toEpochMs(run.updatedAt);
      const { time, ampm } = formatPendingTime(updatedAt);
      const tagInfo = pendingTagForRun(run.status, t);
      pending.push({
        id: `pending-run-${run.id}`,
        kind: 'run',
        title: run.title || t('dashboard.pending_run'),
        subtitle: t('dashboard.pending_run_sub'),
        refId: run.id,
        timestamp: updatedAt,
        timeLabel: time,
        ampm,
        ...tagInfo,
      });
    }
  }
  pending.sort((a, b) => a.timestamp - b.timestamp);
  return pending;
}

function buildActivityFeed(
  resources: DashboardResource[],
  chats: DashboardChatSession[],
  nowMs: number,
  t: TranslateFn,
): ActivityItem[] {
  const resourcesById = new Map(resources.map((r) => [r.id, r]));
  const sevenDaysAgoMs = nowMs - 7 * 86400000;
  const resourceActivity: ActivityItem[] = resources
    .filter((r) => toEpochMs(r.updated_at) >= sevenDaysAgoMs)
    .sort((a, b) => toEpochMs(b.updated_at) - toEpochMs(a.updated_at))
    .slice(0, 8)
    .map((r) => ({
      id: `resource-${r.id}`,
      kind: 'resource' as ActivityKind,
      title: r.title || 'Untitled',
      subtitle: r.type,
      timestamp: toEpochMs(r.updated_at),
      resourceId: r.id,
      resourceType: r.type,
    }));

  const chatActivity: ActivityItem[] = chats.slice(0, 8).map((s) => {
    const linked = s.resource_id ? resourcesById.get(s.resource_id) : undefined;
    const sessionTitle = 'title' in s && typeof s.title === 'string' ? s.title.trim() : '';
    return {
      id: `chat-${s.id}`,
      kind: 'chat' as ActivityKind,
      title: sessionTitle || linked?.title || t('dashboard.activity_chat_default'),
      timestamp: toEpochMs(s.updated_at ?? s.created_at),
      sessionId: s.id,
    };
  });

  return [...resourceActivity, ...chatActivity]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
}


export function useDashboardData(projectId: string | null = null): DashboardData {
  const { i18n } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [statsDeltas, setStatsDeltas] = useState<DashboardStatsDeltas>(EMPTY_DELTAS);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [runs, setRuns] = useState<PersistentRun[]>([]);
  const [upcomingEventsList, setUpcomingEventsList] = useState<DashboardUpcomingEvent[]>([]);
  const [gamification, setGamification] = useState<HomeGamification>(EMPTY_GAMIFICATION);
  const [pendingToday, setPendingToday] = useState<PendingTodayItem[]>([]);
  const [activityDayCounts, setActivityDayCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const loadSeqRef = useRef(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);
    const t = i18n.t.bind(i18n);
    try {
      const scopedPid = projectId ?? 'default';
      const [resourcesResult, eventsResult, chatsResult, decksResult, runsResult] = await Promise.all([
        window.electron?.db?.resources?.listLight?.(2000, scopedPid),
        window.electron?.calendar?.getUpcoming?.({ windowMinutes: 60 * 24 * 7, limit: 50 }),
        db.getChatSessionsGlobal({ limit: 5000, projectId: scopedPid }),
        window.electron?.db?.flashcards?.getDecksByProject?.(scopedPid),
        listRuns({ limit: 80, projectId: scopedPid }).catch(() => [] as PersistentRun[]),
      ]);

      const allResources = okArray<DashboardResource>(resourcesResult).filter(
        (resource) => resource.project_id === scopedPid,
      );

      const { rows: studioRows, count: studioCount } = await fetchStudioRows(scopedPid);

      const decks = okArray<{ id: string; project_id?: string | null }>(decksResult).filter(
        (deck) => deck.project_id === scopedPid,
      );
      const dueFlashcards = await countDueFlashcards(decks);

      const eventsRaw: DashboardUpcomingEvent[] =
        eventsResult?.success && Array.isArray(eventsResult.events) ? eventsResult.events : [];

      if (seq !== loadSeqRef.current) return;

      setUpcomingEventsList(
        eventsRaw.map((e) => ({
          id: e.id,
          title: e.title,
          start_at: e.start_at,
          calendar_color: e.calendar_color,
        })),
      );

      const chats = okArray<DashboardChatSession>(chatsResult);
      const runsSafe = Array.isArray(runsResult) ? runsResult : [];
      setRuns(runsSafe.slice(0, 8));

      const activeRuns = countActiveRuns(runsSafe);
      const tw = makeTimeWindows(Date.now());
      const tally: ActivityTally = { activityDays: new Set<string>(), dayCountMap: {} };

      const studioCreatedThisWeek = tallyStudioRows(studioRows, tally, tw.weekStartMs);
      const cardsStudiedThisWeek = await tallyFlashcardSessions(decks, tally, tw.weekStartMs);
      const resourceTotals = tallyResources(allResources, tally, tw);
      const chatTotals = tallyChats(chats, tally, tw);
      const runTotals = tallyRuns(runsSafe, tally, tw);

      const dailyGoals = buildDailyGoals({
        resourcesCreatedToday: resourceTotals.resourcesCreatedToday,
        resourcesEditedToday: resourceTotals.resourcesEditedToday,
        chatsToday: chatTotals.chatsToday,
        runsCompletedToday: runTotals.runsCompletedToday,
        activeRuns,
        t,
      });

      const dailyGoalProgress = dailyGoals.filter((g) => g.done).length;

      const streakDays = computeStreak(tally.activityDays);
      const currentWeekEnergy = {
        weeklyCreated: resourceTotals.weeklyResourcesCreated,
        weeklyTouches: resourceTotals.weeklyResourceTouches,
        weeklyChats: chatTotals.weeklyChatSessions,
        weeklyRuns: runTotals.weeklyRunsCompleted,
      };
      const momentumPercent = computeMomentumPercent(currentWeekEnergy);
      const weeklyEnergyDelta = computeWeeklyEnergyDelta(currentWeekEnergy, {
        weeklyCreated: resourceTotals.prevWeeklyResourcesCreated,
        weeklyTouches: resourceTotals.prevWeeklyResourceTouches,
        weeklyChats: chatTotals.prevWeeklyChatSessions,
        weeklyRuns: runTotals.prevWeeklyRunsCompleted,
      });

      const pending = buildPendingToday({ dueFlashcards, eventsRaw, runs: runsSafe, tw, t });

      setGamification({
        streakDays,
        momentumPercent,
        weeklyEnergyDelta,
        dailyGoalTarget: 3,
        dailyGoalProgress,
        dailyGoals,
        weeklyResourcesCreated: resourceTotals.weeklyResourcesCreated,
        weeklyResourceTouches: resourceTotals.weeklyResourceTouches,
        weeklyChatSessions: chatTotals.weeklyChatSessions,
        weeklyRunsCompleted: runTotals.weeklyRunsCompleted,
        pendingTodayCount: pending.length,
      });

      setStats({
        resourceCount: allResources.length,
        studioCount,
        dueFlashcards,
        upcomingEvents: eventsRaw.length,
        recentChats: chats.length,
        activeRuns,
      });

      setStatsDeltas({
        resources: resourceTotals.resourcesCreatedThisWeek,
        chats: chatTotals.chatsThisWeek,
        dueCards: cardsStudiedThisWeek,
        studioDocs: studioCreatedThisWeek,
        activeRuns: runTotals.runsStartedThisWeek,
      });

      setActivityDayCounts(tally.dayCountMap);

      setActivity(buildActivityFeed(allResources, chats, tw.nowMs, t));

      setPendingToday(pending.slice(0, 8));
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      console.error('[useDashboardData] Error loading dashboard data:', error);
      setActivityDayCounts({});
    } finally {
      if (seq !== loadSeqRef.current) return;
      if (!silent) setLoading(false);
    }
  }, [projectId, i18n.language]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSilentReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void load({ silent: true });
      }, BACKGROUND_RELOAD_DEBOUNCE_MS);
    };

    const unsubscribeCreated = window.electron.on('resource:created', scheduleSilentReload);
    const unsubscribeUpdated = window.electron.on('resource:updated', scheduleSilentReload);
    const unsubscribeDeleted = window.electron.on('resource:deleted', scheduleSilentReload);
    let unsubscribeChat: (() => void) | undefined;
    try {
      unsubscribeChat = window.electron.on('chat:session-updated', scheduleSilentReload);
    } catch {
      /* channel unavailable */
    }
    let unsubscribeRuns: (() => void) | undefined;
    try {
      unsubscribeRuns = onRunUpdated(() => scheduleSilentReload());
    } catch {
      /* Electron API not fully available */
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeChat?.();
      unsubscribeRuns?.();
    };
  }, [load]);

  return {
    stats,
    statsDeltas,
    activity,
    runs,
    upcomingEventsList,
    gamification,
    activityDayCounts,
    pendingToday,
    loading,
    refresh: () => load({ silent: false }),
  };
}
