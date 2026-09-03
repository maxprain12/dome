import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { QrCodeIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
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
import { Skeleton } from '@/components/ui/skeleton';
import type { SocialEventCard } from '@/components/social/socialTypes';
import { socialEventCardLabel } from '@/lib/social/socialQueues';

const METRIC_KEYS = [
  'page_view',
  'qr_scan',
  'apple_download',
  'google_save_click',
  'dm_matched',
  'dm_sent',
  'comment_reply_sent',
  'dm_click',
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

const FUNNEL_STEPS: MetricKey[] = ['dm_matched', 'dm_sent', 'comment_reply_sent', 'dm_click'];

interface EventMetricsPayload {
  metrics?: { totals?: Partial<Record<string, number>> };
  totals?: Partial<Record<string, number>>;
}

function extractTotals(data: unknown): Record<string, number> {
  if (!data || typeof data !== 'object') return {};
  const payload = data as EventMetricsPayload;
  const raw = payload.metrics?.totals ?? payload.totals ?? {};
  const totals: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) totals[key] = value;
  }
  return totals;
}

function rate(numerator: number, denominator: number): string | null {
  if (denominator <= 0) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

interface SocialEventInsightsProps {
  onOpenPeople?: () => void;
  onOpenEvents?: () => void;
}

export function SocialEventInsights({ onOpenPeople, onOpenEvents }: SocialEventInsightsProps) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SocialEventCard[] | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setError(null);
      const response = await window.electron.invoke('social:event-cards:list');
      const nextCards: SocialEventCard[] = response?.success
        ? (response.data?.cards ?? [])
        : [];
      if (!active) return;
      setCards(nextCards);

      const published = nextCards.filter((card) => card.status === 'published');
      if (!published.length) {
        setTotals({});
        return;
      }

      const metricResults = await Promise.all(
        published.map((card) =>
          window.electron.invoke('social:event-cards:metrics', { cardId: card.id }),
        ),
      );
      if (!active) return;

      let failed = 0;
      const aggregate = metricResults.reduce<Record<string, number>>((acc, result) => {
        if (!result?.success) {
          failed += 1;
          return acc;
        }
        for (const [key, value] of Object.entries(extractTotals(result.data))) {
          acc[key] = (acc[key] ?? 0) + value;
        }
        return acc;
      }, {});
      setTotals(aggregate);
      if (failed === metricResults.length) {
        setError(t('social.events.analytics_empty_hint'));
      }
    })().catch((reason: unknown) => {
      if (!active) return;
      setCards([]);
      setError(reason instanceof Error ? reason.message : t('social.events.provider_error'));
    });
    return () => {
      active = false;
    };
  }, [t]);

  if (cards === null) return <Skeleton className="h-64 w-full" />;

  const publishedCount = cards.filter((card) => card.status === 'published').length;
  const hasSignal = METRIC_KEYS.some((key) => (totals[key] ?? 0) > 0);
  const dmMatched = totals.dm_matched ?? 0;
  const dmSent = totals.dm_sent ?? 0;
  const replies = totals.comment_reply_sent ?? 0;
  const dmClick = totals.dm_click ?? 0;
  const dmRate = rate(dmSent, dmMatched);
  const clickRate = rate(dmClick, dmSent);
  const showFunnel = dmMatched > 0 || dmSent > 0 || replies > 0 || dmClick > 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <HugeiconsIcon icon={QrCodeIcon} />
            <Badge variant="outline">{publishedCount}</Badge>
          </div>
          <CardTitle>{t('social.studio.insights.funnel_title')}</CardTitle>
          <CardDescription>{t('social.studio.insights.funnel_description')}</CardDescription>
          {onOpenPeople ? (
            <CardAction>
              <Button type="button" size="sm" variant="outline" onClick={onOpenPeople}>
                <HugeiconsIcon icon={UserMultiple02Icon} data-icon="inline-start" />
                {t('social.studio.insights.view_leads')}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {!publishedCount ? (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={QrCodeIcon} />
                </EmptyMedia>
                <EmptyTitle>{t('social.events.empty')}</EmptyTitle>
                <EmptyDescription>{t('social.studio.insights.funnel_empty')}</EmptyDescription>
              </EmptyHeader>
              {onOpenEvents ? (
                <EmptyContent>
                  <Button type="button" size="sm" onClick={onOpenEvents}>
                    {t('social.studio.insights.open_events')}
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : showFunnel ? (
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)_0.75rem_minmax(0,1fr)_0.75rem_minmax(0,1fr)] xl:items-center xl:gap-0">
              {FUNNEL_STEPS.flatMap((key, index) => {
                const value =
                  key === 'dm_matched'
                    ? dmMatched
                    : key === 'dm_sent'
                      ? dmSent
                      : key === 'comment_reply_sent'
                        ? replies
                        : dmClick;
                const stepRate =
                  key === 'dm_sent' ? dmRate : key === 'dm_click' ? clickRate : null;
                const rateLabel =
                  key === 'dm_sent'
                    ? t('social.events.funnel_rate_dm')
                    : key === 'dm_click'
                      ? t('social.events.funnel_rate_click')
                      : null;
                const step = (
                  <li key={key} className="min-w-0 rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                      {t(`social.studio.insights.funnel_step_${key}`)}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {Intl.NumberFormat().format(value)}
                    </p>
                    {stepRate && rateLabel ? (
                      <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                        {rateLabel}: {stepRate}
                      </p>
                    ) : (
                      <p className="mt-1 text-[0.6875rem] text-transparent">—</p>
                    )}
                  </li>
                );
                if (index === 0) return [step];
                return [
                  <li
                    key={`${key}-connector`}
                    aria-hidden
                    className="hidden h-px self-center bg-border xl:block"
                  />,
                  step,
                ];
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              {error || t('social.events.analytics_empty_hint')}
            </p>
          )}
        </CardContent>
        {onOpenPeople && showFunnel ? (
          <CardFooter>
            <Button type="button" variant="secondary" size="sm" onClick={onOpenPeople}>
              <HugeiconsIcon icon={UserMultiple02Icon} data-icon="inline-start" />
              {t('social.studio.insights.view_leads')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card className="@container/event-metrics">
        <CardHeader>
          <CardTitle>{t('social.studio.insights.events')}</CardTitle>
          <CardDescription>{t('social.studio.insights.events_description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!publishedCount ? (
            <p className="text-sm text-muted-foreground">{t('social.events.analytics_empty_hint')}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 @3xl/event-metrics:grid-cols-4">
                {METRIC_KEYS.map((key: MetricKey) => (
                  <div key={key} className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                      {t(`social.events.metrics.${key}`)}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {Intl.NumberFormat().format(totals[key] ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
              {!hasSignal ? (
                <p className="text-xs text-muted-foreground">
                  {error || t('social.events.analytics_empty_hint')}
                </p>
              ) : null}
              {cards.slice(0, 3).map((card) => (
                <span key={card.id} className="sr-only">
                  {socialEventCardLabel(card)}
                </span>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
