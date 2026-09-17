import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SocialProvider } from '@/components/social/socialTypes';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import type { RadarCluster, RadarFeedId, RadarSnapshot } from '@/lib/social/radarTypes';

const NETWORKS: Array<'all' | SocialProvider> = ['all', 'instagram', 'linkedin', 'x'];

export function useSocialTrendsRadar() {
  const { t, i18n } = useTranslation();
  const projectId = useAppStore((state) => state.currentProject?.id ?? 'default');
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [network, setNetwork] = useState<'all' | SocialProvider>('all');
  const [feed, setFeed] = useState<RadarFeedId>('radar');
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exploringTheme, setExploringTheme] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electron.invoke('social:trends:snapshot', {
        projectId,
        windowDays,
        language: i18n.language?.slice(0, 2),
      });
      if (!res?.success) throw new Error(res?.error || 'Error');
      setSnapshot(res.data as RadarSnapshot);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [i18n.language, projectId, windowDays]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const clusters = useMemo(() => {
    const all = snapshot?.feeds?.[feed] ?? [];
    if (network === 'all') return all;
    return all.filter((cluster) => cluster.networks.includes(network));
  }, [feed, network, snapshot]);

  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? null;

  const recordEvent = useCallback(async (
    cluster: RadarCluster,
    eventType: 'impression' | 'open' | 'save' | 'dismiss',
  ) => {
    try {
      await window.electron.invoke('social:trends:event', {
        projectId,
        clusterId: cluster.id,
        eventType,
        payload: { topicKey: cluster.topicKey, topics: cluster.topics || [] },
      });
    } catch {
      // funnel logging is best-effort
    }
  }, [projectId]);

  const exploreTheme = async (theme: string) => {
    setExploringTheme(theme);
    try {
      const res = await window.electron.invoke('social:explorations:run-theme', {
        projectId,
        theme,
        provider: network === 'all' ? undefined : network,
      });
      if (!res?.success) throw new Error(res?.error || t('social.references.capture_error'));
      const queued = Number((res.data as { queued?: number } | undefined)?.queued || 0);
      if (queued > 0) {
        showToast('success', t('social.trends.explore_theme_queued', { count: queued }));
      } else {
        showToast('info', t('social.trends.explore_theme_none'));
      }
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : t('social.references.capture_error'));
    } finally {
      setExploringTheme(null);
    }
  };

  return {
    t,
    networks: NETWORKS,
    projectId,
    windowDays,
    setWindowDays,
    network,
    setNetwork,
    feed,
    setFeed,
    snapshot,
    error,
    loading,
    exploringTheme,
    clusters,
    selected,
    setSelectedId,
    refresh,
    recordEvent,
    exploreTheme,
  };
}
