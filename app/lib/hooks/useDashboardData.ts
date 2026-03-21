import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/client';
import { listRuns } from '@/lib/automations/api';
import type { PersistentRun } from '@/lib/automations/api';

export interface DashboardStats {
  resourceCount: number;
  studioCount: number;
  dueFlashcards: number;
  upcomingEvents: number;
  recentChats: number;
}

export interface RecentResource {
  id: string;
  title: string;
  type: string;
  project_id: string;
  updated_at: number;
  metadata?: { color?: string; [key: string]: unknown };
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

export interface DashboardData {
  stats: DashboardStats;
  recentResources: RecentResource[];
  activity: ActivityItem[];
  runs: PersistentRun[];
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

export function useDashboardData(): DashboardData {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentResources, setRecentResources] = useState<RecentResource[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [runs, setRuns] = useState<PersistentRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recentResult, resourcesResult, eventsResult, chatsResult, decksResult, runsResult] =
        await Promise.all([
          window.electron?.ai?.tools?.getRecentResources?.(8),
          window.electron?.db?.resources?.getAll?.(2000),
          window.electron?.calendar?.getUpcoming?.({ windowMinutes: 60 * 24 * 7, limit: 50 }),
          db.getChatSessionsGlobal(20),
          window.electron?.db?.flashcards?.getAllDecks?.(200),
          listRuns({ limit: 5 }).catch(() => [] as PersistentRun[]),
        ]);

      // All resources for stats and activity feed (includes metadata)
      const allResources: Array<{
        id: string; title: string; type: string; project_id: string; updated_at: number;
        metadata?: string | Record<string, unknown>;
      }> =
        resourcesResult?.success && Array.isArray(resourcesResult.data)
          ? resourcesResult.data
          : [];

      // Build a metadata map keyed by resource id so we can enrich recentResources
      const metaMap = new Map<string, { color?: string }>();
      for (const r of allResources) {
        if (r.metadata) {
          try {
            const parsed: { color?: string } =
              typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata as { color?: string });
            if (parsed?.color) metaMap.set(r.id, { color: parsed.color });
          } catch { /* ignore */ }
        }
      }

      // Recent resources for the "recently opened" row — enriched with metadata
      const rawRecent: RecentResource[] =
        recentResult?.success && Array.isArray(recentResult.resources)
          ? recentResult.resources
          : [];
      const nextRecentResources: RecentResource[] = rawRecent.map((r) => ({
        ...r,
        metadata: metaMap.get(r.id) ?? r.metadata,
      }));
      setRecentResources(nextRecentResources);

      // Studio count (global, across all projects)
      const projectsResult = await db.getProjects();
      const projectList =
        projectsResult.success && Array.isArray(projectsResult.data) ? projectsResult.data : [];
      let studioCount = 0;
      if (window.electron?.db?.studio?.getByProject && projectList.length > 0) {
        const studioResults = await Promise.all(
          projectList.map((p: { id: string }) =>
            window.electron.db.studio.getByProject(p.id).catch(() => null),
          ),
        );
        studioCount = studioResults.reduce((sum, r) => {
          return sum + (r?.success && Array.isArray(r.data) ? r.data.length : 0);
        }, 0);
      }

      // Due flashcards
      const decks: Array<{ id: string }> =
        decksResult?.success && Array.isArray(decksResult.data) ? decksResult.data : [];
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

      const upcomingEvents =
        eventsResult?.success && Array.isArray(eventsResult.events)
          ? eventsResult.events.length
          : 0;

      const chats =
        chatsResult.success && Array.isArray(chatsResult.data) ? chatsResult.data : [];

      setStats({
        resourceCount: allResources.length,
        studioCount,
        dueFlashcards,
        upcomingEvents,
        recentChats: chats.length,
      });

      // Activity feed: merge recently-modified resources + recent chats
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

      const chatActivity: ActivityItem[] = chats.slice(0, 5).map(
        (s: { id: string; updated_at?: number; created_at: number }) => ({
          id: `chat-${s.id}`,
          kind: 'chat' as ActivityKind,
          title: 'Chat',
          timestamp: ((s.updated_at ?? s.created_at) || s.created_at) * 1000,
          sessionId: s.id,
        }),
      );

      const merged = [...resourceActivity, ...chatActivity]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 12);
      setActivity(merged);

      setRuns(Array.isArray(runsResult) ? runsResult : []);
    } catch (error) {
      console.error('[useDashboardData] Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;

    const unsubs = [
      window.electron.on('resource:created', () => void load()),
      window.electron.on('resource:updated', () => void load()),
      window.electron.on('resource:deleted', () => void load()),
    ];

    return () => {
      unsubs.forEach((fn) => fn?.());
    };
  }, [load]);

  return { stats, recentResources, activity, runs, loading, refresh: load };
}
