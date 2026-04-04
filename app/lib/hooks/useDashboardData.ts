import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/client';
import { listRuns, onRunUpdated } from '@/lib/automations/api';
import type { PersistentRun } from '@/lib/automations/api';

export interface DashboardStats {
  resourceCount: number;
  studioCount: number;
  dueFlashcards: number;
  upcomingEvents: number;
  recentChats: number;
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
  dailyGoalTarget: number;
  dailyGoalProgress: number;
  weeklyResourcesCreated: number;
  weeklyResourceTouches: number;
  weeklyChatSessions: number;
  weeklyRunsCompleted: number;
}

export type PendingTodayKind = 'flashcards' | 'calendar' | 'run';

export interface PendingTodayItem {
  id: string;
  kind: PendingTodayKind;
  title: string;
  subtitle?: string;
  /** run id o event id para navegación */
  refId?: string;
  timestamp: number;
}

export interface DashboardData {
  stats: DashboardStats;
  activity: ActivityItem[];
  runs: PersistentRun[];
  upcomingEventsList: DashboardUpcomingEvent[];
  gamification: HomeGamification;
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
};

const EMPTY_GAMIFICATION: HomeGamification = {
  streakDays: 0,
  momentumPercent: 0,
  dailyGoalTarget: 3,
  dailyGoalProgress: 0,
  weeklyResourcesCreated: 0,
  weeklyResourceTouches: 0,
  weeklyChatSessions: 0,
  weeklyRunsCompleted: 0,
};

function localDayKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDayMs(tsMs: number): number {
  const d = new Date(tsMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeStreak(activityDays: Set<string>): number {
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

function computeMomentumPercent(params: {
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

export function useDashboardData(projectId: string | null = null): DashboardData {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [runs, setRuns] = useState<PersistentRun[]>([]);
  const [upcomingEventsList, setUpcomingEventsList] = useState<DashboardUpcomingEvent[]>([]);
  const [gamification, setGamification] = useState<HomeGamification>(EMPTY_GAMIFICATION);
  const [pendingToday, setPendingToday] = useState<PendingTodayItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const scopedPid = projectId ?? 'default';
      const [resourcesResult, eventsResult, chatsResult, decksResult, runsResult] = await Promise.all([
        window.electron?.db?.resources?.getAll?.(2000),
        window.electron?.calendar?.getUpcoming?.({ windowMinutes: 60 * 24 * 7, limit: 50 }),
        db.getChatSessionsGlobal({ limit: 80, projectId: scopedPid }),
        window.electron?.db?.flashcards?.getAllDecks?.(200),
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
      if (window.electron?.db?.studio?.getByProject) {
        const studioResult = await window.electron.db.studio.getByProject(scopedPid).catch(() => null);
        studioCount =
          studioResult?.success && Array.isArray(studioResult.data) ? studioResult.data.length : 0;
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
          return sum + (r?.success ? Number(r.data?.due_cards || 0) : 0);
        }, 0);
      }

      const eventsRaw: Array<{
        id: string;
        title: string;
        start_at: number;
        calendar_color?: string;
      }> =
        eventsResult?.success && Array.isArray(eventsResult.events) ? eventsResult.events : [];
      setUpcomingEventsList(
        eventsRaw.map((e) => ({
          id: e.id,
          title: e.title,
          start_at: e.start_at,
          calendar_color: e.calendar_color,
        })),
      );

      const upcomingEvents = eventsRaw.length;

      const chats = chatsResult.success && Array.isArray(chatsResult.data) ? chatsResult.data : [];

      setStats({
        resourceCount: allResources.length,
        studioCount,
        dueFlashcards,
        upcomingEvents,
        recentChats: chats.length,
      });

      const nowMs = Date.now();
      const startToday = startOfLocalDayMs(nowMs);
      const endToday = startToday + 86400000;
      const weekStartMs = nowMs - 7 * 86400000;

      const runsSafe = Array.isArray(runsResult) ? runsResult : [];
      setRuns(runsSafe.slice(0, 8));

      const activityDays = new Set<string>();
      let weeklyResourcesCreated = 0;
      let weeklyResourceTouches = 0;
      let resourcesCreatedToday = 0;
      let resourcesEditedToday = 0;

      for (const r of allResources) {
        const createdSec = r.created_at ?? r.updated_at;
        const cMs = createdSec * 1000;
        const uMs = r.updated_at * 1000;
        activityDays.add(localDayKey(cMs));
        activityDays.add(localDayKey(uMs));
        if (cMs >= weekStartMs) weeklyResourcesCreated++;
        if (uMs >= weekStartMs) weeklyResourceTouches++;
        if (cMs >= startToday && cMs < endToday) resourcesCreatedToday++;
        if (uMs >= startToday && uMs < endToday && uMs > cMs + 30 * 1000) resourcesEditedToday++;
      }

      let chatsToday = 0;
      let weeklyChatSessions = 0;
      for (const s of chats) {
        const ca = (s.created_at ?? 0) * 1000;
        const ua = (s.updated_at ?? s.created_at) * 1000;
        activityDays.add(localDayKey(ca));
        activityDays.add(localDayKey(ua));
        if (Math.max(ca, ua) >= weekStartMs) weeklyChatSessions++;
        if (ua >= startToday && ua < endToday) chatsToday++;
      }

      let runsCompletedToday = 0;
      let weeklyRunsCompleted = 0;
      for (const run of runsSafe) {
        const finished = run.finishedAt ?? run.updatedAt;
        activityDays.add(localDayKey(run.startedAt));
        activityDays.add(localDayKey(run.updatedAt));
        if (run.finishedAt) activityDays.add(localDayKey(run.finishedAt));
        if (run.status === 'completed') {
          if (finished >= weekStartMs) weeklyRunsCompleted++;
          if (finished >= startToday && finished < endToday) runsCompletedToday++;
        }
      }

      const dailyGoalProgress = Math.min(
        3,
        (resourcesCreatedToday > 0 ? 1 : 0) +
          (resourcesEditedToday > 0 ? 1 : 0) +
          (chatsToday > 0 ? 1 : 0) +
          (runsCompletedToday > 0 ? 1 : 0),
      );

      const streakDays = computeStreak(activityDays);
      const momentumPercent = computeMomentumPercent({
        weeklyCreated: weeklyResourcesCreated,
        weeklyTouches: weeklyResourceTouches,
        weeklyChats: weeklyChatSessions,
        weeklyRuns: weeklyRunsCompleted,
      });

      setGamification({
        streakDays,
        momentumPercent,
        dailyGoalTarget: 3,
        dailyGoalProgress,
        weeklyResourcesCreated,
        weeklyResourceTouches,
        weeklyChatSessions,
        weeklyRunsCompleted,
      });

      const resourcesById = new Map(allResources.map((r) => [r.id, r]));
      const sevenDaysAgoSecs = (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000;
      const resourceActivity: ActivityItem[] = allResources
        .filter((r) => r.updated_at > sevenDaysAgoSecs)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 8)
        .map((r) => ({
          id: `resource-${r.id}`,
          kind: 'resource' as ActivityKind,
          title: r.title || 'Untitled',
          subtitle: r.type,
          timestamp: r.updated_at * 1000,
          resourceId: r.id,
          resourceType: r.type,
        }));

      const chatActivity: ActivityItem[] = chats.slice(0, 8).map((s) => {
        const linked = s.resource_id ? resourcesById.get(s.resource_id) : undefined;
        return {
          id: `chat-${s.id}`,
          kind: 'chat' as ActivityKind,
          title: linked?.title ? `Chat · ${linked.title}` : 'Chat',
          timestamp: ((s.updated_at ?? s.created_at) || s.created_at) * 1000,
          sessionId: s.id,
        };
      });

      const merged = [...resourceActivity, ...chatActivity]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 12);
      setActivity(merged);

      const pending: PendingTodayItem[] = [];
      if (dueFlashcards > 0) {
        pending.push({
          id: 'pending-flashcards',
          kind: 'flashcards',
          title: '',
          subtitle: String(dueFlashcards),
          timestamp: nowMs,
        });
      }
      for (const ev of eventsRaw) {
        const st = ev.start_at;
        if (st >= startToday && st < endToday) {
          pending.push({
            id: `pending-cal-${ev.id}`,
            kind: 'calendar',
            title: ev.title || 'Event',
            refId: ev.id,
            timestamp: st,
          });
        }
      }
      for (const run of runsSafe) {
        if (run.status === 'running' || run.status === 'waiting_approval' || run.status === 'queued') {
          pending.push({
            id: `pending-run-${run.id}`,
            kind: 'run',
            title: run.title || 'Run',
            subtitle: run.status,
            refId: run.id,
            timestamp: run.updatedAt,
          });
        }
      }

      pending.sort((a, b) => a.timestamp - b.timestamp);
      setPendingToday(pending.slice(0, 8));
    } catch (error) {
      console.error('[useDashboardData] Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;

    const unsubs: Array<(() => void) | undefined> = [
      window.electron.on('resource:created', () => void load()),
      window.electron.on('resource:updated', () => void load()),
      window.electron.on('resource:deleted', () => void load()),
    ];
    try {
      unsubs.push(onRunUpdated(() => void load()));
    } catch {
      /* Electron API not fully available */
    }

    return () => {
      unsubs.forEach((fn) => fn?.());
    };
  }, [load]);

  return {
    stats,
    activity,
    runs,
    upcomingEventsList,
    gamification,
    pendingToday,
    loading,
    refresh: load,
  };
}
