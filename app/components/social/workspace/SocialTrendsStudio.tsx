import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ListState from '@/components/shared/ListState';
import { SocialEvidenceCard } from '@/components/social/cards/SocialEvidenceCard';
import { publicCardToModelSafe } from '@/components/social/cards/socialCardModel';
import { PROVIDER_LABELS } from '@/components/social/crm/socialCrmChrome';
import type { SocialProvider } from '@/components/social/socialTypes';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';

type TrendSignal = {
  id: string;
  theme: string;
  labelKind: string;
  ownCount: number;
  referenceCount: number;
  score: number;
  confidence: number;
  provenance: string;
  sources: string[];
  providers?: SocialProvider[];
  windowDays: number;
};

type TrendCreative = {
  origin: 'own' | 'reference';
  provider: SocialProvider | null;
  format: string | null;
  isVideo: boolean;
  title: string | null;
  url: string | null;
  author: { name?: string | null; handle?: string | null; avatarUrl?: string | null };
  media?: Array<{ type?: 'image' | 'video' | 'reel'; url?: string; thumbnailUrl?: string }>;
  metrics?: Record<string, number | null> | null;
  topics?: string[];
  publishedAt?: number | null;
  engagementScore?: number | null;
};

type TrendSnapshot = {
  windowDays: number;
  generatedAt: number;
  ownPostCount: number;
  referenceCount: number;
  signals: TrendSignal[];
  formats: Array<{ format: string; count: number }>;
  creatives?: TrendCreative[];
  mix?: { video: number; carousel: number; post: number };
  recommendedFormat?: 'reel' | 'carousel' | 'post' | null;
  limitations: string[];
};

const NETWORKS: Array<'all' | SocialProvider> = ['all', 'instagram', 'linkedin', 'x'];

function labelKindKey(kind: string): string {
  switch (kind) {
    case 'works_on_your_accounts':
      return 'social.trends.works_on_your_accounts';
    case 'appears_in_references':
      return 'social.trends.appears_in_references';
    default:
      return 'social.trends.shared_pattern';
  }
}

function limitationLabel(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'own_and_references_only':
      return t('social.trends.limitation_own_and_references');
    case 'no_platform_explore':
      return t('social.trends.limitation_no_platform_explore');
    case 'no_invented_metrics':
      return t('social.trends.limitation_no_invented_metrics');
    default:
      return code.includes(' ') ? code : t('social.trends.limitation_own_and_references');
  }
}

function recommendKey(format: TrendSnapshot['recommendedFormat']): string {
  switch (format) {
    case 'reel':
      return 'social.trends.recommend_video';
    case 'carousel':
      return 'social.trends.recommend_carousel';
    case 'post':
      return 'social.trends.recommend_post';
    case null:
    case undefined:
      return 'social.trends.recommend_mixed';
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

export function SocialTrendsStudio({
  onPlanPost,
}: {
  onPlanPost?: (seed: { body?: string; topics?: string[] }) => void;
} = {}) {
  const { t } = useTranslation();
  const projectId = useAppStore((state) => state.currentProject?.id ?? 'default');
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [network, setNetwork] = useState<'all' | SocialProvider>('all');
  const [snapshot, setSnapshot] = useState<TrendSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exploringTheme, setExploringTheme] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electron.invoke('social:trends:snapshot', { projectId, windowDays });
      if (!res?.success) throw new Error(res?.error || 'Error');
      setSnapshot(res.data as TrendSnapshot);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [projectId, windowDays]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const signals = useMemo(() => {
    const all = snapshot?.signals ?? [];
    if (network === 'all') return all;
    return all.filter((signal) => (signal.providers || []).includes(network));
  }, [network, snapshot]);

  const creatives = useMemo(() => {
    const all = snapshot?.creatives ?? [];
    if (network === 'all') return all;
    return all.filter((item) => item.provider === network);
  }, [network, snapshot]);

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

  const hasContent = creatives.length > 0 || signals.length > 0 || (snapshot?.formats.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('social.studio.nav.trends')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('social.trends.hint')}</p>
        </div>
        <Button type="button" size="sm" onClick={() => { refresh().catch(() => {}); }} disabled={loading}>
          {t('social.trends.refresh')}
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        {NETWORKS.map((item) => (
          <Button
            key={item}
            type="button"
            size="xs"
            variant={network === item ? 'secondary' : 'ghost'}
            onClick={() => setNetwork(item)}
          >
            {item === 'all' ? t('social.trends.all_networks') : PROVIDER_LABELS[item]}
          </Button>
        ))}
        {([7, 30, 90] as const).map((days) => (
          <Button
            key={days}
            type="button"
            size="xs"
            variant={windowDays === days ? 'secondary' : 'ghost'}
            onClick={() => setWindowDays(days)}
          >
            {t('social.trends.window', { days })}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
        {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
        {!snapshot || !hasContent ? (
          <ListState
            variant="empty"
            title={t('social.trends.empty_title')}
            description={t('social.trends.empty_description')}
            fullHeight
          />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <p className="text-xs text-muted-foreground">
              {t('social.trends.scope', {
                posts: snapshot.ownPostCount,
                references: snapshot.referenceCount,
              })}
            </p>
            {snapshot.recommendedFormat || creatives.length > 0 ? (
              <section className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-medium">{t(recommendKey(snapshot.recommendedFormat))}</p>
                {snapshot.formats.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('social.trends.formats')}</span>
                    {snapshot.formats.slice(0, 8).map((item) => (
                      <Badge key={item.format} variant="outline">
                        {t(`social.native.format_${item.format}`, { defaultValue: item.format })} · {item.count}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {creatives.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{t('social.trends.creatives_title')}</h3>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {creatives.map((item, index) => {
                    const model = publicCardToModelSafe({
                      provider: item.provider || undefined,
                      kind: 'post',
                      format: item.format,
                      url: item.url,
                      body: item.title,
                      author: item.author,
                      media: item.media,
                      metrics: item.metrics,
                      publishedAt: item.publishedAt,
                    });
                    if (!model) return null;
                    const key = item.url || `${item.origin}-${item.publishedAt || index}`;
                    return (
                      <div key={key} className="min-w-0">
                        <SocialEvidenceCard
                          model={model}
                          variant="tile"
                          actions={
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label={t('social.trends.plan_post')}
                              onClick={() => onPlanPost?.({
                                body: item.title ? `${item.title}\n` : '',
                                topics: item.topics,
                              })}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} />
                            </Button>
                          }
                        />
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.origin === 'own'
                            ? t('social.trends.origin_own')
                            : t('social.trends.origin_reference')}
                          {item.isVideo ? ` · ${t('social.native.format_reel')}` : null}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">{t('social.trends.creatives_empty')}</p>
            )}

            {signals.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('social.trends.themes_title')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {signals.slice(0, 16).map((signal) => (
                    <Button
                      key={signal.id}
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={exploringTheme === signal.theme}
                      onClick={() => { exploreTheme(signal.theme).catch(() => {}); }}
                    >
                      {signal.theme}
                      <span className="text-muted-foreground">
                        {t(labelKindKey(signal.labelKind))}
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            {snapshot.limitations.map((limitation) => (
              <p key={limitation} className="text-xs text-muted-foreground">
                {limitationLabel(limitation, t)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
