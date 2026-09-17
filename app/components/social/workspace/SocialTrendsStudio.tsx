import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import ListState from '@/components/shared/ListState';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import { showToast } from '@/lib/store/useToastStore';
import type { RadarCluster, RadarFeedId, RadarSnapshot } from '@/lib/social/radarTypes';
import { SocialTrendClusterCard } from './SocialTrendClusterCard';
import { SocialTrendEvidenceSheet } from './SocialTrendEvidenceSheet';
import { useSocialTrendsRadar } from './useSocialTrendsRadar';

const FEEDS: RadarFeedId[] = ['forYou', 'emerging', 'popular', 'radar'];
const WINDOWS = [7, 30, 90] as const;

function limitationLabel(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'own_and_references_only':
      return t('social.trends.limitation_own_and_references');
    case 'no_platform_explore':
      return t('social.trends.limitation_no_platform_explore');
    case 'no_invented_metrics':
      return t('social.trends.limitation_no_invented_metrics');
    case 'offline':
      return t('social.trends.status_offline');
    case 'budget_exhausted':
      return t('social.trends.status_budget');
    case 'permissions':
      return t('social.trends.status_permissions');
    case 'insufficient_temporal_evidence':
    case 'insufficient_breadth':
      return t('social.trends.status_insufficient');
    case 'social_cloud_unavailable':
    case 'flag_disabled':
    case 'unreachable':
      return t('social.trends.status_cloud_unavailable');
    default:
      return code.includes(' ') ? code : t('social.trends.limitation_own_and_references');
  }
}

function emptyCopy(feed: RadarFeedId): { title: string; description: string } {
  switch (feed) {
    case 'forYou':
      return { title: 'social.trends.empty_foryou_title', description: 'social.trends.empty_foryou_description' };
    case 'emerging':
      return { title: 'social.trends.empty_emerging_title', description: 'social.trends.empty_emerging_description' };
    case 'popular':
      return { title: 'social.trends.empty_popular_title', description: 'social.trends.empty_popular_description' };
    case 'radar':
      return { title: 'social.trends.empty_title', description: 'social.trends.empty_description' };
    default: {
      const _exhaustive: never = feed;
      return _exhaustive;
    }
  }
}

function statusCopy(feed: RadarFeedId, snapshot: RadarSnapshot, t: (key: string) => string): string | null {
  if (snapshot.budget?.exhausted) return t('social.trends.status_budget');
  const codes = snapshot.limitations || [];
  const quiet = new Set(['own_and_references_only', 'no_invented_metrics', 'no_platform_explore']);
  const radarOnly = new Set(['offline', 'budget_exhausted', 'permissions', 'social_cloud_unavailable', 'flag_disabled', 'unreachable']);
  const priority = feed === 'radar'
    ? ['budget_exhausted', 'offline', 'permissions', 'social_cloud_unavailable', 'flag_disabled', 'unreachable']
    : ['budget_exhausted', 'insufficient_temporal_evidence', 'insufficient_breadth', 'offline', 'permissions', 'social_cloud_unavailable'];
  const hit = priority.find((code) => codes.includes(code) && (feed === 'radar' ? radarOnly.has(code) : !quiet.has(code)));
  return hit ? limitationLabel(hit, t) : null;
}

function asFeed(value: string | undefined): RadarFeedId | null {
  switch (value) {
    case 'forYou':
    case 'emerging':
    case 'popular':
    case 'radar':
      return value;
    default:
      return null;
  }
}

export function SocialTrendsStudio({
  onPlanPost,
}: {
  onPlanPost?: (seed: { body?: string; topics?: string[] }) => void;
} = {}) {
  const { t } = useTranslation();
  const radar = useSocialTrendsRadar();

  const createFrom = async (cluster: RadarCluster) => {
    try {
      const res = await window.electron.invoke('social:trends:create-from', {
        projectId: radar.projectId,
        clusterId: cluster.id,
      });
      if (!res?.success) throw new Error(res?.error || t('social.references.capture_error'));
      const seed = (res.data as { seed?: { body?: string; topics?: string[] } })?.seed;
      onPlanPost?.(seed || { topics: cluster.topics });
      showToast('success', t('social.trends.create_queued'));
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : t('social.references.capture_error'));
    }
  };

  const empty = emptyCopy(radar.feed);
  const status = radar.snapshot ? statusCopy(radar.feed, radar.snapshot, t) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <ToggleGroup
          value={[radar.feed]}
          variant="outline"
          size="sm"
          aria-label={t('social.studio.nav.trends')}
          onValueChange={(values) => {
            const next = asFeed(values[0]);
            if (next) radar.setFeed(next);
          }}
        >
          {FEEDS.map((id) => (
            <ToggleGroupItem key={id} value={id}>
              {t(`social.trends.feed_${id === 'forYou' ? 'foryou' : id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          value={[radar.network]}
          variant="outline"
          size="sm"
          aria-label={t('social.trends.all_networks')}
          onValueChange={(values) => {
            const next = values[0];
            if (next === 'all' || next === 'instagram' || next === 'linkedin' || next === 'x') {
              radar.setNetwork(next);
            }
          }}
        >
          {radar.networks.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {item === 'all' ? t('social.trends.all_networks') : PROVIDER_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          value={[String(radar.windowDays)]}
          variant="outline"
          size="sm"
          aria-label={t('social.trends.window', { days: radar.windowDays })}
          onValueChange={(values) => {
            const next = Number(values[0]);
            if (next === 7 || next === 30 || next === 90) radar.setWindowDays(next);
          }}
        >
          {WINDOWS.map((days) => (
            <ToggleGroupItem key={days} value={String(days)}>
              {t('social.trends.window', { days })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => { radar.refresh().catch(() => {}); }}
          disabled={radar.loading}
        >
          {t('social.trends.refresh')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {radar.loading && !radar.snapshot ? (
          <ListState variant="loading" loadingLabel={t('social.trends.loading')} fullHeight />
        ) : radar.error && !radar.snapshot ? (
          <ListState
            variant="error"
            title={t('social.trends.error_title')}
            errorMessage={radar.error}
            onRetry={() => { radar.refresh().catch(() => {}); }}
            fullHeight
          />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            {radar.snapshot ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t('social.trends.scope', {
                    posts: radar.snapshot.ownPostCount,
                    references: radar.snapshot.referenceCount,
                  })}
                </span>
                {radar.feed === 'radar' && radar.snapshot.formats.length > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    {radar.snapshot.formats.slice(0, 4).map((item) => (
                      <Badge key={item.format} variant="outline">
                        {t(`social.native.format_${item.format}`, { defaultValue: item.format })}
                        {' · '}
                        {item.count}
                      </Badge>
                    ))}
                  </>
                ) : null}
                {status ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{status}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            {radar.clusters.length === 0 ? (
              <ListState
                variant="empty"
                title={t(empty.title)}
                description={t(empty.description)}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {radar.clusters.map((cluster) => (
                  <SocialTrendClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    selected={radar.selected?.id === cluster.id}
                    onOpen={() => {
                      radar.setSelectedId(cluster.id);
                      radar.recordEvent(cluster, 'open').catch(() => {});
                    }}
                    onCreate={() => { createFrom(cluster).catch(() => {}); }}
                    onDismiss={() => { radar.recordEvent(cluster, 'dismiss').catch(() => {}); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SocialTrendEvidenceSheet
        cluster={radar.selected}
        open={Boolean(radar.selected)}
        onOpenChange={(open) => {
          if (!open) radar.setSelectedId(null);
        }}
        onCreate={() => {
          if (radar.selected) createFrom(radar.selected).catch(() => {});
        }}
        onExplore={(theme) => { radar.exploreTheme(theme).catch(() => {}); }}
      />
    </div>
  );
}
