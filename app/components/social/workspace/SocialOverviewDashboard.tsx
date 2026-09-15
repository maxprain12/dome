import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import { formatSocialBody } from '@/components/social/crm/socialCrmChrome';
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
import { DashboardDataTable } from '@/components/shared/dashboard/DashboardDataTable';
import { DashboardSectionCards } from '@/components/shared/dashboard/DashboardSectionCards';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
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
}: {
  posts: SocialPost[];
  growth: SocialGrowthAccount[];
  accountId: string | null;
  onOpenPost: (post: SocialPost) => void;
  onOpenContent: () => void;
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

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:px-6 md:py-5">
        <DashboardSectionCards
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
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <DashboardAreaChart
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
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('social.studio.overview.mix_title')}</CardTitle>
              <CardDescription>{t('social.studio.overview.mix_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {mix.map((slice) => (
                <MixBar
                  key={slice.id}
                  slice={slice}
                  label={t(`social.studio.overview.mix_${slice.id}`)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
        <DashboardDataTable
          toolbarEnd={
            <Button type="button" size="sm" variant="ghost" onClick={onOpenContent}>
              {t('social.studio.overview.view_all')}
            </Button>
          }
          columns={[
            {
              id: 'title',
              header: t('social.studio.overview.recent_title'),
              cell: (row) => formatSocialBody(socialPostLabel(row.post)),
            },
            {
              id: 'when',
              header: t('dashboard.col_when'),
              className: 'hidden sm:table-cell',
              cell: (row) => formatSocialWhen(row.post.publishedAt ?? row.post.createdAt, locale),
            },
          ]}
          rows={recent.map((post) => ({ id: post.id, post }))}
          emptyTitle={t('social.studio.overview.recent_empty')}
          onRowClick={(row) => onOpenPost(row.post)}
        />
      </div>
    </ScrollArea>
  );
}
