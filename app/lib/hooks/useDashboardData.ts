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

      const allResourcesRaw: Array<{
        id: string;
        title: string;
        type: string;
        project_id: string;
        created_at?: number;
        updated_at: number;
        metadata?: string | Record<string, unknown>;
      }> =
        resourcesResult?.success && Array.isArray(resourcesResult.data)
          ? resourcesResult.data
          : [];
      const allResources = allResourcesRaw.filter((resource) => resource.project_id === scopedPid);

      let studioCount = 0;
      let studioCreatedThisWeek = 0;
      const studioRows: Array<{ created_at?: number; updated_at?: number }> = [];
      if (window.electron?.db?.studio?.getByProject) {
        const studioResult = await window.electron.db.studio.getByProject(scopedPid).catch(() => null);
        if (studioResult?.success && Array.isArray(studioResult.data)) {
          studioRows.push(...studioResult.data);
          studioCount = studioResult.data.length;
        }
      }

      const decksRaw: Array<{ id: string; project_id?: string | null }> =
        decksResult?.success && Array.isArray(decksResult.data) ? decksResult.data : [];
      const decks = decksRaw.filter((deck) => deck.project_id === scopedPid);
      let dueFlashcards = 0;
      if (window.electron?.db?.flashcards?.getStats && decks.length > 0) {
        const deckStats = await Promise.all(
          decks.map((deck) =>
            window.electron.db.flashcards.getStats(deck.id).catch(() => null),
          ),
        );
        dueFlashcards = deckStats.reduce((sum, r) => {
          if (!r?.success || !r.data) return sum;
          return sum + Number(r.data.due_cards || 0) + Number(r.data.new_cards || 0);
        }, 0);
      }

      const eventsRaw: Array<{
        id: string;
        title: string;
        start_at: number;
        calendar_color?: string;
      }> =
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

      const chats = chatsResult.success && Array.isArray(chatsResult.data) ? chatsResult.data : [];
      const runsSafe = Array.isArray(runsResult) ? runsResult : [];
      setRuns(runsSafe.slice(0, 8));

      const activeRuns = countActiveRuns(runsSafe);
      const nowMs = Date.now();
      const startToday = startOfLocalDayMs(nowMs);
      const endToday = startToday + 86400000;
      const weekStartMs = nowMs - 7 * 86400000;
      const prevWeekStartMs = nowMs - 14 * 86400000;

      const activityDays = new Set<string>();
      const dayCountMap: Record<string, number> = {};
      const bumpDay = (key: string) => {
        if (!key) return;
        dayCountMap[key] = (dayCountMap[key] ?? 0) + 1;
      };

      let weeklyResourcesCreated = 0;
      let weeklyResourceTouches = 0;
      let resourcesCreatedToday = 0;
      let resourcesEditedToday = 0;
      let resourcesCreatedThisWeek = 0;
      let prevWeeklyResourcesCreated = 0;
      let prevWeeklyResourceTouches = 0;
      let cardsStudiedThisWeek = 0;

      for (const row of studioRows) {
        const cMs = toEpochMs(row.created_at ?? row.updated_at);
        const uMs = toEpochMs(row.updated_at ?? row.created_at);
        activityDays.add(localDayKey(cMs));
        if (uMs !== cMs) activityDays.add(localDayKey(uMs));
        bumpDay(localDayKey(cMs));
        if (localDayKey(uMs) !== localDayKey(cMs)) bumpDay(localDayKey(uMs));
        if (cMs >= weekStartMs) studioCreatedThisWeek++;
      }

      if (window.electron?.db?.flashcards?.getSessions && decks.length > 0) {
        const sessionResults = await Promise.all(
          decks.map((deck) =>
            window.electron.db.flashcards.getSessions(deck.id, 120).catch(() => null),
          ),
        );
        for (const result of sessionResults) {
          const sessions =
            result?.success && Array.isArray(result.data) ? result.data : [];
          for (const session of sessions) {
            const st = toEpochMs(session.started_at);
            activityDays.add(localDayKey(st));
            bumpDay(localDayKey(st));
            if (st >= weekStartMs) {
              cardsStudiedThisWeek += Number(session.cards_studied ?? 0);
            }
          }
        }
      }

      for (const r of allResources) {
        const cMs = toEpochMs(r.created_at ?? r.updated_at);
        const uMs = toEpochMs(r.updated_at);
        activityDays.add(localDayKey(cMs));
        activityDays.add(localDayKey(uMs));
        bumpDay(localDayKey(cMs));
        const uk = localDayKey(uMs);
        if (uk !== localDayKey(cMs)) bumpDay(uk);
        else if (uMs > cMs + 1000) bumpDay(uk);
        if (cMs >= weekStartMs) weeklyResourcesCreated++;
        if (uMs >= weekStartMs) weeklyResourceTouches++;
        if (cMs >= startToday && cMs < endToday) resourcesCreatedToday++;
        if (uMs >= startToday && uMs < endToday && uMs > cMs + 30 * 1000) resourcesEditedToday++;
        if (cMs >= weekStartMs) resourcesCreatedThisWeek++;
        else if (cMs >= prevWeekStartMs && cMs < weekStartMs) prevWeeklyResourcesCreated++;
        if (uMs >= prevWeekStartMs && uMs < weekStartMs) prevWeeklyResourceTouches++;
      }

      let chatsToday = 0;
      let weeklyChatSessions = 0;
      let chatsThisWeek = 0;
      let prevWeeklyChatSessions = 0;
      for (const s of chats) {
        const ca = toEpochMs(s.created_at);
        const ua = toEpochMs(s.updated_at ?? s.created_at);
        activityDays.add(localDayKey(ca));
        activityDays.add(localDayKey(ua));
        bumpDay(localDayKey(ca));
        const uak = localDayKey(ua);
        if (uak !== localDayKey(ca)) bumpDay(uak);
        const maxTs = Math.max(ca, ua);
        if (maxTs >= weekStartMs) weeklyChatSessions++;
        if (ua >= startToday && ua < endToday) chatsToday++;
        if (maxTs >= weekStartMs) chatsThisWeek++;
        else if (maxTs >= prevWeekStartMs && maxTs < weekStartMs) prevWeeklyChatSessions++;
      }

      let runsCompletedToday = 0;
      let weeklyRunsCompleted = 0;
      let prevWeeklyRunsCompleted = 0;
      let runsStartedThisWeek = 0;
      for (const run of runsSafe) {
        const startedAt = toEpochMs(run.startedAt);
        const finished = toEpochMs(run.finishedAt ?? run.updatedAt);
        const updatedAt = toEpochMs(run.updatedAt);
        activityDays.add(localDayKey(startedAt));
        activityDays.add(localDayKey(updatedAt));
        if (run.finishedAt) activityDays.add(localDayKey(finished));
        bumpDay(localDayKey(startedAt));
        if (run.finishedAt) bumpDay(localDayKey(finished));
        if (startedAt >= weekStartMs) runsStartedThisWeek++;
        if (run.status === 'completed') {
          if (finished >= weekStartMs) weeklyRunsCompleted++;
          if (finished >= startToday && finished < endToday) runsCompletedToday++;
          if (finished >= prevWeekStartMs && finished < weekStartMs) prevWeeklyRunsCompleted++;
        }
      }

      const dailyGoals = buildDailyGoals({
        resourcesCreatedToday,
        resourcesEditedToday,
        chatsToday,
        runsCompletedToday,
        activeRuns,
        t,
      });

      const dailyGoalProgress = dailyGoals.filter((g) => g.done).length;

      const streakDays = computeStreak(activityDays);
      const momentumPercent = computeMomentumPercent({
        weeklyCreated: weeklyResourcesCreated,
        weeklyTouches: weeklyResourceTouches,
        weeklyChats: weeklyChatSessions,
        weeklyRuns: weeklyRunsCompleted,
      });
      const weeklyEnergyDelta = computeWeeklyEnergyDelta(
        {
          weeklyCreated: weeklyResourcesCreated,
          weeklyTouches: weeklyResourceTouches,
          weeklyChats: weeklyChatSessions,
          weeklyRuns: weeklyRunsCompleted,
        },
        {
          weeklyCreated: prevWeeklyResourcesCreated,
          weeklyTouches: prevWeeklyResourceTouches,
          weeklyChats: prevWeeklyChatSessions,
          weeklyRuns: prevWeeklyRunsCompleted,
        },
      );

      const pending: PendingTodayItem[] = [];
      if (dueFlashcards > 0) {
        const tagInfo = { tag: t('dashboard.tag_study'), tagKind: 'warn' as PendingTagKind };
        pending.push({
          id: 'pending-flashcards',
          kind: 'flashcards',
          title: t('dashboard.pending_flashcards', { count: dueFlashcards }),
          subtitle: t('dashboard.pending_flashcards_sub'),
          timestamp: nowMs,
          ...formatPendingTime(nowMs),
          ...tagInfo,
        });
      }
      for (const ev of eventsRaw) {
        const st = toEpochMs(ev.start_at);
        if (st >= startToday && st < endToday + 86400000) {
          const { time, ampm } = formatPendingTime(st);
          const tagInfo = pendingTagForEvent(st, nowMs, t);
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
      for (const run of runsSafe) {
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
      const pendingTodayCount = pending.length;

      setGamification({
        streakDays,
        momentumPercent,
        weeklyEnergyDelta,
        dailyGoalTarget: 3,
        dailyGoalProgress,
        dailyGoals,
        weeklyResourcesCreated,
        weeklyResourceTouches,
        weeklyChatSessions,
        weeklyRunsCompleted,
        pendingTodayCount,
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
        resources: resourcesCreatedThisWeek,
        chats: chatsThisWeek,
        dueCards: cardsStudiedThisWeek,
        studioDocs: studioCreatedThisWeek,
        activeRuns: runsStartedThisWeek,
      });

      setActivityDayCounts(dayCountMap);

      const resourcesById = new Map(allResources.map((r) => [r.id, r]));
      const sevenDaysAgoMs = nowMs - 7 * 86400000;
      const resourceActivity: ActivityItem[] = allResources
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

      const merged = [...resourceActivity, ...chatActivity]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 12);
      setActivity(merged);

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
