import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BarChartIcon,
  SparklesIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  SocialGrowthAccount,
  SocialPost,
  SocialProvider,
  SocialReport,
} from '@/components/social/socialTypes';
import { SocialEventInsights } from '@/components/social/insights/SocialEventInsights';
import {
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
  type InsightsPeriodDays,
} from '@/components/social/insights/insightsMetrics';
import { useTabStore } from '@/lib/store/useTabStore';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
};

const PERIODS: InsightsPeriodDays[] = [7, 30, 90];

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

interface SocialInsightsStudioProps {
  posts: SocialPost[];
  growth: SocialGrowthAccount[];
  onSelectReport: (report: SocialReport) => void;
  onOpenEvents: () => void;
  onOpenAccounts: () => void;
}

export function SocialInsightsStudio({
  posts,
  growth: initialGrowth,
  onSelectReport,
  onOpenEvents,
  onOpenAccounts,
}: SocialInsightsStudioProps) {
  const { t } = useTranslation();
  const openPeopleTab = useTabStore((s) => s.openPeopleTab);
  const [period, setPeriod] = useState<InsightsPeriodDays>(30);
  const [growth, setGrowth] = useState(initialGrowth);
  const [reports, setReports] = useState<SocialReport[]>([]);
  const [generating, setGenerating] = useState(false);
  const [growthLoading, setGrowthLoading] = useState(false);

  useEffect(() => {
    setGrowth(initialGrowth);
  }, [initialGrowth]);

  const loadReports = useCallback(async () => {
    const response = await window.electron.invoke('social:reports:list');
    if (!response?.success) return;
    setReports(Array.isArray(response.data?.reports) ? response.data.reports : []);
  }, []);

  useEffect(() => { loadReports();
    const unsubscribe = window.electron?.on?.('social:report-updated', () => { loadReports();
    });
    return () => unsubscribe?.();
  }, [loadReports]);

  useEffect(() => {
    let active = true;
    setGrowthLoading(true); (async () => {
      try {
        const response = await window.electron.invoke('social:growth', { days: period });
        if (!active || !response?.success) return;
        setGrowth(Array.isArray(response.data?.accounts) ? response.data.accounts : []);
      } finally {
        if (active) setGrowthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [period]);

  const metrics = useMemo(() => sumPostMetricsInPeriod(posts, period), [posts, period]);
  const followers = sumFollowersSnapshot(growth);
  const followersDelta = sumFollowersDelta(growth);
  const periodHint = t('social.studio.insights.selected_period', { days: period });
  const format = (n: number) => Intl.NumberFormat().format(n);

  const generate = async () => {
    setGenerating(true);
    try {
      await window.electron.invoke('social:reports:generate', { periodDays: period });
      await loadReports();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            {t('social.studio.insights.eyebrow')}
          </p>
          <h2 className="font-heading text-2xl font-semibold">{t('social.studio.insights.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('social.studio.insights.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={[String(period)]}
            onValueChange={(value) => {
              const next = Number(value[0]);
              if (next === 7 || next === 30 || next === 90) setPeriod(next);
            }}
            variant="outline"
          >
            {PERIODS.map((days) => (
              <ToggleGroupItem key={days} value={String(days)}>
                {days}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button type="button" onClick={() => generate()} disabled={generating}>
            {generating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
            )}
            {t('social.agent_reports_generate')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('social.studio.insights.kpi_impressions')}
          value={format(metrics.impressions)}
          hint={periodHint}
        />
        <MetricCard
          label={t('social.studio.insights.kpi_likes')}
          value={format(metrics.likes)}
          hint={periodHint}
        />
        <MetricCard
          label={t('social.studio.insights.kpi_comments')}
          value={format(metrics.comments)}
          hint={periodHint}
        />
        <MetricCard
          label={t('social.studio.insights.kpi_followers')}
          value={format(followers)}
          hint={
            followersDelta == null
              ? t('social.studio.insights.latest_snapshot')
              : t('social.studio.insights.followers_delta', {
                  delta: `${followersDelta >= 0 ? '+' : ''}${format(followersDelta)}`,
                  days: period,
                })
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t('social.studio.insights.audience')}</CardTitle>
            <CardDescription>{t('social.studio.insights.audience_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {growthLoading && growth.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('social.studio.insights.loading_audience')}</p>
            ) : growth.length === 0 ? (
              <Empty className="border border-dashed py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={BarChartIcon} />
                  </EmptyMedia>
                  <EmptyTitle>{t('social.studio.insights.audience_empty_title')}</EmptyTitle>
                  <EmptyDescription>
                    {t('social.studio.insights.audience_empty_description')}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" size="sm" onClick={onOpenAccounts}>
                    {t('social.studio.insights.open_accounts')}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {growth.map((account) => (
                  <div key={account.accountId} className="rounded-xl border bg-muted/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {account.displayName ||
                            account.handle ||
                            PROVIDER_LABELS[account.provider]}
                        </p>
                        {account.handle ? (
                          <p className="truncate text-xs text-muted-foreground">{account.handle}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{PROVIDER_LABELS[account.provider]}</Badge>
                    </div>
                    <p className="mt-4 text-2xl font-semibold tabular-nums">
                      {account.latest?.followers != null
                        ? format(account.latest.followers)
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.delta == null
                        ? t('social.agent_presence_na')
                        : `${account.delta >= 0 ? '+' : ''}${format(account.delta)} · ${period}d`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('social.agent_reports_section')}</CardTitle>
            <CardDescription>{t('social.agent_reports_hint_short')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {reports.length === 0 ? (
              <Empty className="border border-dashed py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={SparklesIcon} />
                  </EmptyMedia>
                  <EmptyTitle>{t('social.reports.empty_title')}</EmptyTitle>
                  <EmptyDescription>{t('social.studio.insights.reports_empty')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              reports.slice(0, 5).map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className="rounded-xl p-3 text-left transition-colors hover:bg-muted"
                  onClick={() => onSelectReport(report)}
                >
                  <span className="block truncate text-sm font-medium">
                    {report.title || t('social.reports.untitled')}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                    <Badge variant="outline">{t(`social.studio.status.${report.status}`)}</Badge>
                  </span>
                </button>
              ))
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => generate()}
              disabled={generating}
            >
              {generating ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
              )}
              {t('social.agent_reports_generate')}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <SocialEventInsights
        onOpenPeople={() => openPeopleTab()}
        onOpenEvents={onOpenEvents}
      />

      {posts.length === 0 && growth.length === 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={UserMultiple02Icon} className="mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('social.studio.insights.zero_title')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('social.studio.insights.zero_description')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onOpenAccounts}>
                {t('social.studio.insights.open_accounts')}
              </Button>
              <Button type="button" size="sm" onClick={onOpenEvents}>
                {t('social.studio.insights.open_events')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
