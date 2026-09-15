import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import {
  buildAudienceSeries,
  compactSocialNumber,
  engagementMix,
  filterGrowthByAccount,
  formatTrendPct,
  postTimestampMs,
  previousPeriodMetrics,
  postsInPeriod,
  recentPublishedPosts,
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
  trendDirection,
  trendPct,
  type InsightsPeriodDays,
} from '@/components/social/insights/insightsMetrics';
import { localDayKey } from '@/lib/hooks/dashboardGamification';
import { buildActivityChartPoints } from '@/components/shared/dashboard/activityChart';
import { DashboardAreaChart, type DashboardChartRange } from '@/components/shared/dashboard/DashboardAreaChart';
import { DashboardSectionCards } from '@/components/shared/dashboard/DashboardSectionCards';
import { DashboardWorkspace, type DashboardPanel } from '@/components/shared/dashboard/DashboardWorkspace';
import { SocialEditorialQueue, SocialRecentPublications } from './SocialEditorialPanels';
import { MixBar } from './SocialOverviewCharts';

function metricTrend(current: number | null, previous: number | null, locale: string) {
  const pct = trendPct(current, previous);
  return {
    direction: trendDirection(pct),
    trend: formatTrendPct(pct, locale),
  };
}

function fillFollowerSeries(
  series: Array<{ t: number; followers: number | null }>,
): Array<{ date: string; value: number }> {
  const firstKnown = series.find((point) => point.followers != null)?.followers ?? null;
  let last = firstKnown;
  return series.map((point) => {
    if (point.followers != null) last = point.followers;
    return { date: localDayKey(point.t), value: last ?? 0 };
  });
}

export function SocialOverviewDashboard({
  posts,
  growth,
  accountId,
  onOpenPost,
  onOpenContent,
  onCompose,
}: {
  posts: SocialPost[];
  growth: SocialGrowthAccount[];
  accountId: string | null;
  onOpenPost: (post: SocialPost) => void;
  onOpenContent: () => void;
  onCompose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'es';
  const [period, setPeriod] = useState<InsightsPeriodDays>(30);
  const scopedGrowth = useMemo(
    () => filterGrowthByAccount(growth, accountId).map((account) => {
      const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
      const points = account.points.filter((point) => point.t >= cutoff);
      const first = points[0]?.followers;
      const last = points.at(-1)?.followers;
      return { ...account, delta: points.length > 1 && first != null && last != null ? last - first : null };
    }),
    [accountId, growth, period],
  );
  const current = useMemo(() => sumPostMetricsInPeriod(posts, period), [period, posts]);
  const previous = useMemo(() => previousPeriodMetrics(posts, period), [period, posts]);
  const series = useMemo(
    () => buildAudienceSeries(scopedGrowth, period),
    [period, scopedGrowth],
  );
  const periodPosts = postsInPeriod(posts.filter((post) => post.status === 'published'), period);
  const hasInteractions = periodPosts.some((post) => [post.metrics?.likes, post.metrics?.comments, post.metrics?.shares].some((value) => typeof value === 'number'));
  const mix = useMemo(() => engagementMix(current), [current]);
  const recent = useMemo(() => recentPublishedPosts(posts, 6), [posts]);
  const followers = sumFollowersSnapshot(scopedGrowth);
  const followersDelta = sumFollowersDelta(scopedGrowth);
  const followerTrendPct =
    followers == null || followersDelta == null ? null : trendPct(followers, followers - followersDelta);
  const chartRange: DashboardChartRange = period === 7 ? '7d' : period === 90 ? '90d' : '30d';
  const hasAudience = series.some((point) => point.followers != null);
  const postChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const post of posts.filter((item) => item.status === 'published')) {
      const ts = postTimestampMs(post);
      if (!ts) continue;
      const key = localDayKey(ts);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return buildActivityChartPoints(counts, chartRange);
  }, [chartRange, posts]);
  const chartData = hasAudience ? fillFollowerSeries(series) : postChartData;
  const chartTitle = hasAudience
    ? t('social.studio.overview.audience_title')
    : t('social.studio.overview.kpi_posts');
  const chartValueLabel = hasAudience
    ? t('social.studio.insights.kpi_followers')
    : t('social.studio.overview.kpi_posts');
  const postsTrend = metricTrend(current.postsInPeriod, previous.postsInPeriod, locale);
  const followersTrend = formatTrendPct(followerTrendPct, locale);

  const panels: DashboardPanel[] = [
    { id: 'summary', label: t('dashboardPanels.summary'), wide: true, content: <DashboardSectionCards
          items={[
            {
              id: 'posts',
              label: t('social.studio.overview.kpi_posts'),
              value: compactSocialNumber(current.postsInPeriod, locale),
              deltaLabel: postsTrend.trend ?? undefined,
            },
            {
              id: 'impressions',
              label: t('social.studio.insights.kpi_impressions'),
              value: compactSocialNumber(current.impressions, locale),
            },
            {
              id: 'engagements',
              label: t('social.studio.overview.kpi_engagements'),
              value: compactSocialNumber(hasInteractions ? current.engagements : null, locale),
            },
            {
              id: 'followers',
              label: t('social.studio.insights.kpi_followers'),
              value: compactSocialNumber(followers, locale),
              deltaLabel: followersTrend ?? undefined,
            },
          ]}
        /> },
    { id: 'editorial', label: t('dashboardPanels.editorial'), content: <SocialEditorialQueue posts={posts} onOpenPost={onOpenPost} onCompose={onCompose} /> },
    { id: 'audience', label: chartTitle, content: <DashboardAreaChart
            title={chartTitle}
            description={t('social.studio.overview.metrics_scope')}
            data={chartData}
            range={chartRange}
            onRangeChange={(next) => {
              setPeriod(next === '7d' ? 7 : next === '90d' ? 90 : 30);
            }}
            valueLabel={chartValueLabel}
            rangeLabels={{
              '7d': t('dashboard.chart_range_7d'),
              '30d': t('dashboard.chart_range_30d'),
              '90d': t('dashboard.chart_range_90d'),
            }}
            emptyTitle={t('social.studio.insights.audience_empty_title')}
          /> },
    { id: 'recent', label: t('social.studio.overview.recent_title'), wide: true, content: <SocialRecentPublications posts={recent} onOpenPost={onOpenPost} onOpenContent={onOpenContent} /> },
    { id: 'mix', label: t('social.studio.overview.mix_title'), content: <Card>
            <CardHeader>
              <CardTitle>{t('social.studio.overview.mix_title')}</CardTitle>
              <CardDescription>{t('social.studio.overview.mix_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {hasInteractions ? <>
              {mix.map((slice) => (
                <MixBar
                  key={slice.id}
                  slice={slice}
                  label={t(`social.studio.overview.mix_${slice.id}`)}
                />
              ))}
              </> : <p className="py-6 text-sm text-muted-foreground">{t('dashboardPanels.metrics_empty')}</p>}
            </CardContent>
          </Card> },
    { id: 'studio', label: t('dashboardPanels.studio'), content: <Card variant="lavender">
      <CardHeader><CardTitle>{t('dashboardPanels.studio')}</CardTitle><CardDescription>{t('dashboardPanels.studio_hint')}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4"><p className="text-4xl font-semibold tabular-nums">{posts.filter((post) => post.status === 'draft').length}<span className="ml-2 text-sm font-normal text-muted-foreground">{t('dashboardPanels.draft')}</span></p><Button variant="outline" onClick={onCompose}>{t('dashboardPanels.create_post')}</Button><Button variant="ghost" onClick={onOpenContent}>{t('dashboardPanels.view_all')}</Button></CardContent>
    </Card> },
  ];
  return <ScrollArea className="@container/dashboard min-h-0 flex-1 bg-muted/30">
    <DashboardWorkspace scope="social" eyebrow={t('dashboardPanels.social_eyebrow')} title={t('dashboardPanels.social_title')} description={t('dashboardPanels.social_hint')} panels={panels} actions={<ToggleGroup value={[String(period)]} aria-label={t('dashboardPanels.period')} onValueChange={(values) => { const next = Number(values[0]); if (next === 7 || next === 30 || next === 90) setPeriod(next); }} variant="outline" size="sm">{([7, 30, 90] as const).map((days) => <ToggleGroupItem key={days} value={String(days)}>{t(`dashboard.chart_range_${days}d`)}</ToggleGroupItem>)}</ToggleGroup>} />
  </ScrollArea>;
}
