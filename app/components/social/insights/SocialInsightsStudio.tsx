import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BarChartIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  SocialGrowthAccount,
  SocialPost,
  SocialReport,
} from '@/components/social/socialTypes';
import { SocialEventInsights } from '@/components/social/insights/SocialEventInsights';
import {
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
  type InsightsPeriodDays,
} from '@/components/social/insights/insightsMetrics';
import { ReadField, SectionCard } from '@/components/social/crm/socialCrmChrome';
import { SocialReportDetailPanel } from '@/components/social/workspace/SocialReportDetailPanel';
import {
  SocialDirectoryColumn,
  SocialDirectoryRow,
  SocialHubSplit,
} from '@/components/social/workspace/SocialDirectoryColumn';
import { useTabStore } from '@/lib/store/useTabStore';

const PERIODS: InsightsPeriodDays[] = [7, 30, 90];

interface SocialInsightsStudioProps {
  posts: SocialPost[];
  growth: SocialGrowthAccount[];
  selectedReport?: SocialReport | null;
  onSelectReport: (report: SocialReport) => void;
  onOpenEvents: () => void;
  onOpenAccounts: () => void;
}

export function SocialInsightsStudio({
  posts,
  growth: initialGrowth,
  selectedReport = null,
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

  useEffect(() => {
    setGrowth(initialGrowth);
  }, [initialGrowth]);

  const loadReports = useCallback(async () => {
    const response = await window.electron.invoke('social:reports:list');
    if (!response?.success) return;
    setReports(Array.isArray(response.data?.reports) ? response.data.reports : []);
  }, []);

  useEffect(() => {
    loadReports().catch(() => {});
    const unsubscribe = window.electron?.on?.('social:report-updated', () => {
      loadReports().catch(() => {});
    });
    return () => unsubscribe?.();
  }, [loadReports]);

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

  const metrics = useMemo(() => sumPostMetricsInPeriod(posts, period), [posts, period]);
  const followers = sumFollowersSnapshot(growth);
  const followersDelta = sumFollowersDelta(growth);
  const format = (n: number) => Intl.NumberFormat().format(n);
  const periodItems = PERIODS.map((days) => ({
    value: String(days),
    label: t('social.studio.insights.selected_period', { days }),
  }));
  const kpi = [
    { label: t('social.studio.insights.kpi_impressions'), value: format(metrics.impressions) },
    { label: t('social.studio.insights.kpi_likes'), value: format(metrics.likes) },
    { label: t('social.studio.insights.kpi_comments'), value: format(metrics.comments) },
    {
      label: t('social.studio.insights.kpi_followers'),
      value:
        followersDelta == null
          ? format(followers)
          : `${format(followers)} (${followersDelta >= 0 ? '+' : ''}${format(followersDelta)})`,
    },
  ];

  const generate = async () => {
    setGenerating(true);
    try {
      await window.electron.invoke('social:reports:generate', { periodDays: period });
      await loadReports();
    } finally {
      setGenerating(false);
    }
  };

  void onOpenAccounts;

  return (
    <SocialHubSplit>
      <SocialDirectoryColumn
        title={t('social.studio.nav.insights')}
        action={
          <Button type="button" size="sm" onClick={() => { generate().catch(() => {}); }} disabled={generating}>
            {generating ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />}
            {t('social.agent_reports_generate')}
          </Button>
        }
        filter={String(period)}
        onFilterChange={(next) => {
          const days = Number(next);
          if (days === 7 || days === 30 || days === 90) setPeriod(days);
        }}
        filterItems={periodItems}
        filterAriaLabel={t('social.studio.crm.filter_by')}
        empty={
          reports.length === 0
            ? {
                icon: <HugeiconsIcon icon={BarChartIcon} className="size-8" />,
                title: t('social.reports.empty_title'),
                description: t('social.studio.insights.reports_empty'),
              }
            : undefined
        }
      >
        <ul className="flex flex-col">
          {reports.map((report) => (
            <SocialDirectoryRow
              key={report.id}
              selected={selectedReport?.id === report.id}
              onClick={() => onSelectReport(report)}
              title={report.title || t('social.reports.untitled')}
              subtitle={new Date(report.createdAt).toLocaleDateString()}
            />
          ))}
        </ul>
      </SocialDirectoryColumn>
      {selectedReport ? (
        <SocialReportDetailPanel report={selectedReport} kpi={kpi} />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              {t('social.studio.crm.detail_empty_report_hint')}
            </p>
            <SectionCard title={t('social.studio.insights.eyebrow')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {kpi.map((item) => (
                  <ReadField key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SectionCard>
            <SocialEventInsights
              onOpenPeople={() => openPeopleTab()}
              onOpenEvents={onOpenEvents}
            />
          </div>
        </ScrollArea>
      )}
    </SocialHubSplit>
  );
}
