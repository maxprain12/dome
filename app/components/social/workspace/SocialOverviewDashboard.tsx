import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import { formatSocialBody, ProviderMark } from '@/components/social/crm/socialCrmChrome';
import {
  averagePerPost,
  buildAudienceSeries,
  compactSocialNumber,
  engagementMix,
  filterGrowthByAccount,
  formatTrendPct,
  previousPeriodMetrics,
  recentPublishedPosts,
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
  trendDirection,
  trendPct,
  type InsightsPeriodDays,
  type TrendDirection,
} from '@/components/social/insights/insightsMetrics';
import { hubCanvasTitleClass, hubFieldLabelClass } from '@/components/shared/hubChrome';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
import { cn } from '@/lib/utils';
import { AudienceGrowthChart, MixBar } from './SocialOverviewCharts';

const PERIODS: InsightsPeriodDays[] = [7, 30, 90];

function TrendMark({
  direction,
  label,
}: {
  direction: TrendDirection;
  label: string | null;
}) {
  if (!label) return null;
  if (direction === 'flat') {
    return <span className="text-[11px] text-muted-foreground">{label}</span>;
  }
  const up = direction === 'up';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        up ? 'text-success' : 'text-destructive',
      )}
    >
      <HugeiconsIcon icon={up ? ArrowUp01Icon : ArrowDown01Icon} className="size-3" />
      {label}
    </span>
  );
}

function metricTrend(current: number, previous: number, locale: string) {
  const pct = trendPct(current, previous);
  return {
    direction: trendDirection(pct),
    trend: formatTrendPct(pct, locale),
  };
}

export function SocialOverviewDashboard({
  posts,
  growth: initialGrowth,
  accountId,
  onCompose,
  onOpenPost,
  onOpenContent,
}: {
  posts: SocialPost[];
  growth: SocialGrowthAccount[];
  accountId: string | null;
  onCompose: () => void;
  onOpenPost: (post: SocialPost) => void;
  onOpenContent: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'es';
  const [period, setPeriod] = useState<InsightsPeriodDays>(30);
  const [growth, setGrowth] = useState(initialGrowth);

  useEffect(() => {
    setGrowth(initialGrowth);
  }, [initialGrowth]);

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await window.electron.invoke('social:growth', { days: period });
      if (!active || !response?.success) return;
      setGrowth(Array.isArray(response.data?.accounts) ? response.data.accounts : []);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [period]);

  const scopedGrowth = useMemo(
    () => filterGrowthByAccount(growth, accountId),
    [accountId, growth],
  );
  const current = useMemo(() => sumPostMetricsInPeriod(posts, period), [period, posts]);
  const previous = useMemo(() => previousPeriodMetrics(posts, period), [period, posts]);
  const series = useMemo(
    () => buildAudienceSeries(posts, scopedGrowth, period),
    [period, posts, scopedGrowth],
  );
  const mix = useMemo(() => engagementMix(current), [current]);
  const recent = useMemo(() => recentPublishedPosts(posts, 6), [posts]);
  const followers = sumFollowersSnapshot(scopedGrowth);
  const followersDelta = sumFollowersDelta(scopedGrowth);
  const followerTrendPct =
    followersDelta == null ? null : followersDelta / Math.max(followers - followersDelta, 1);
  const periodItems = PERIODS.map((days) => ({
    value: String(days),
    label: t('social.studio.insights.selected_period', { days }),
  }));
  const selectedPeriodLabel =
    periodItems.find((item) => item.value === String(period))?.label ?? periodItems[0]?.label ?? '';

  const kpis = [
    {
      id: 'posts',
      name: t('social.studio.overview.kpi_posts'),
      value: compactSocialNumber(current.postsInPeriod, locale),
      ...metricTrend(current.postsInPeriod, previous.postsInPeriod, locale),
    },
    {
      id: 'impressions',
      name: t('social.studio.insights.kpi_impressions'),
      value: compactSocialNumber(current.impressions, locale),
      ...metricTrend(current.impressions, previous.impressions, locale),
    },
    {
      id: 'engagements',
      name: t('social.studio.overview.kpi_engagements'),
      value: compactSocialNumber(current.engagements, locale),
      ...metricTrend(current.engagements, previous.engagements, locale),
    },
    {
      id: 'followers',
      name: t('social.studio.insights.kpi_followers'),
      value: compactSocialNumber(followers, locale),
      direction: trendDirection(followerTrendPct),
      trend: formatTrendPct(followerTrendPct, locale),
    },
    {
      id: 'avg_likes',
      name: t('social.studio.overview.kpi_avg_likes'),
      value: compactSocialNumber(averagePerPost(current.likes, current.postsInPeriod), locale),
      ...metricTrend(
        averagePerPost(current.likes, current.postsInPeriod),
        averagePerPost(previous.likes, previous.postsInPeriod),
        locale,
      ),
    },
  ];

  const seriesTotals = [
    {
      id: 'followers',
      name: t('social.studio.overview.series_followers'),
      value: compactSocialNumber(followers, locale),
      direction: trendDirection(followerTrendPct),
      trend: formatTrendPct(followerTrendPct, locale),
    },
    {
      id: 'impressions',
      name: t('social.studio.overview.series_impressions'),
      value: compactSocialNumber(current.impressions, locale),
      ...metricTrend(current.impressions, previous.impressions, locale),
    },
    {
      id: 'engagements',
      name: t('social.studio.overview.series_engagements'),
      value: compactSocialNumber(current.engagements, locale),
      ...metricTrend(current.engagements, previous.engagements, locale),
    },
  ];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 md:px-6 md:py-5">
        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={hubCanvasTitleClass}>{t('social.studio.overview.performance_title')}</h2>
            <div className="flex items-center gap-2">
              <Select
                value={String(period)}
                onValueChange={(value) => {
                  const days = Number(value);
                  if (days === 7 || days === 30 || days === 90) setPeriod(days);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 w-auto min-w-32"
                  aria-label={t('social.studio.crm.filter_by')}
                >
                  <SelectValue>{selectedPeriodLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {periodItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={onCompose}>
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                {t('social.hub.new_post')}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5 sm:gap-0">
            {kpis.map((kpi) => (
              <div
                key={kpi.id}
                className="flex flex-col gap-1 sm:border-l sm:border-border/70 sm:px-4 sm:first:border-l-0 sm:first:pl-0"
              >
                <span className={hubFieldLabelClass}>{kpi.name}</span>
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{kpi.value}</span>
                <TrendMark direction={kpi.direction} label={kpi.trend} />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-8 border-t pt-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(14rem,1fr)]">
          <section className="flex min-w-0 flex-col gap-4">
            <h2 className={hubCanvasTitleClass}>{t('social.studio.overview.audience_title')}</h2>
            <AudienceGrowthChart
              points={series}
              label={t('social.studio.overview.audience_title')}
              emptyLabel={t('social.studio.insights.audience_empty_title')}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {seriesTotals.map((item) => (
                <div key={item.id} className="flex flex-col gap-0.5">
                  <span className={hubFieldLabelClass}>{item.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{item.value}</span>
                  <TrendMark direction={item.direction} label={item.trend} />
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4 lg:border-l lg:border-border/70 lg:pl-8">
            <h2 className={hubCanvasTitleClass}>{t('social.studio.overview.mix_title')}</h2>
            <div className="flex flex-col gap-0.5">
              <span className={hubFieldLabelClass}>{t('social.studio.overview.mix_total')}</span>
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {compactSocialNumber(current.engagements, locale)}
              </span>
            </div>
            <div>
              {mix.map((slice) => (
                <MixBar
                  key={slice.id}
                  slice={slice}
                  label={t(`social.studio.overview.mix_${slice.id}`)}
                />
              ))}
            </div>
          </section>
        </div>

        <section className="flex flex-col gap-4 border-t pt-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className={hubCanvasTitleClass}>{t('social.studio.overview.recent_title')}</h2>
            <Button type="button" size="xs" variant="ghost" onClick={onOpenContent}>
              {t('social.studio.overview.view_all')}
            </Button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('social.studio.overview.recent_empty')}</p>
          ) : (
            <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((post) => (
                <li key={post.id} className="min-w-0">
                  <button
                    type="button"
                    className="flex w-full min-w-0 flex-col gap-1.5 border border-border bg-card p-3 text-left hover:bg-muted motion-reduce:transition-none"
                    onClick={() => onOpenPost(post)}
                  >
                    <div className="flex items-center gap-2">
                      <ProviderMark provider={post.provider} className="size-6 text-[0.55rem]" />
                      <span className="truncate text-[11px] text-muted-foreground">
                        {formatSocialWhen(post.publishedAt ?? post.createdAt, locale)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm font-medium">
                      {formatSocialBody(socialPostLabel(post))}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
