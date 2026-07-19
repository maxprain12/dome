import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import SocialGrowthCards from '@/components/social/SocialGrowthCards';
import type { SocialEventCard, SocialGrowthAccount } from '@/components/social/socialTypes';
import type { SocialEventSection } from './SocialEventCardsWorkspace';
import { SOCIAL_KPI_CARD_CLASS, SOCIAL_KPI_STRIP_CLASS } from './socialKpiLayout';

type HubSection = 'posts' | SocialEventSection;

function KpiPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={cn(SOCIAL_KPI_CARD_CLASS, 'rounded-lg border bg-card')}>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="mt-auto text-lg font-semibold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

function KpiSkeletonRow({ count = 3 }: { count?: number }) {
  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[5.75rem] w-[10.5rem] shrink-0 rounded-lg" />
      ))}
    </div>
  );
}

function EventCardsKpis({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const published = cards.filter((c) => c.status === 'published').length;
  const drafts = cards.filter((c) => c.status === 'draft').length;
  const archived = cards.filter((c) => c.status === 'archived').length;
  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      <KpiPill label={t('social.events.kpi_total')} value={cards.length} />
      <KpiPill label={t('social.events.status_published')} value={published} />
      <KpiPill label={t('social.events.status_draft')} value={drafts} />
      <KpiPill label={t('social.events.status_archived')} value={archived} />
    </div>
  );
}

function UpdatesKpis({ cards }: { cards: SocialEventCard[] }) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ scheduled: number; sent: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let scheduled = 0;
      let sent = 0;
      await Promise.all(
        cards.map(async (card) => {
          const r = await window.electron.invoke('social:event-updates:list', { cardId: card.id });
          if (!r?.success) return;
          const updates = (r.data as { updates?: Array<{ status: string }> })?.updates ?? [];
          for (const u of updates) {
            if (u.status === 'scheduled') scheduled += 1;
            if (u.status === 'sent') sent += 1;
          }
        }),
      );
      if (!cancelled) setCounts({ scheduled, sent });
    })().catch(() => {
      if (!cancelled) setCounts({ scheduled: 0, sent: 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [cards]);

  if (!counts) return <KpiSkeletonRow />;

  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      <KpiPill label={t('social.events.kpi_cards')} value={cards.length} />
      <KpiPill label={t('social.events.status_scheduled')} value={counts.scheduled} />
      <KpiPill label={t('social.events.status_sent')} value={counts.sent} />
    </div>
  );
}

function AutomationsKpis() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ total: number; active: number } | null>(null);

  useEffect(() => {
    void window.electron
      .invoke('social:dm-rules:list')
      .then((r) => {
        const rules = r?.success
          ? ((r.data as { rules?: Array<{ status: string }> })?.rules ?? [])
          : [];
        setCounts({
          total: rules.length,
          active: rules.filter((rule) => rule.status === 'active').length,
        });
      })
      .catch(() => setCounts({ total: 0, active: 0 }));
  }, []);

  if (!counts) return <KpiSkeletonRow count={2} />;

  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      <KpiPill label={t('social.events.kpi_rules')} value={counts.total} />
      <KpiPill label={t('social.events.status_active')} value={counts.active} />
    </div>
  );
}

function AnalyticsKpis({
  growth,
  cards,
}: {
  growth: SocialGrowthAccount[];
  cards: SocialEventCard[];
}) {
  const { t } = useTranslation();
  const accountsWithFollowers = growth.filter((g) => g.latest?.followers != null).length;
  const publishedCards = cards.filter((c) => c.status === 'published').length;
  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      <KpiPill label={t('social.events.kpi_accounts')} value={growth.length} />
      <KpiPill label={t('social.events.kpi_with_metrics')} value={accountsWithFollowers} />
      <KpiPill label={t('social.events.kpi_live_cards')} value={publishedCards} />
    </div>
  );
}

/**
 * Header KPI strip for Social Hub — content follows the active hub tab.
 */
export function SocialHubKpiBar({
  section,
  growth,
  focusAccountId,
  onFocusAccount,
}: {
  section: HubSection;
  growth: SocialGrowthAccount[];
  focusAccountId: string | null;
  onFocusAccount: (accountId: string | null) => void;
}) {
  const [cards, setCards] = useState<SocialEventCard[] | null>(null);

  const loadCards = useCallback(async () => {
    if (section === 'posts') return;
    const response = await window.electron.invoke('social:event-cards:list');
    if (!response?.success) {
      setCards([]);
      return;
    }
    setCards((response.data as { cards?: SocialEventCard[] } | null)?.cards ?? []);
  }, [section]);

  useEffect(() => {
    void loadCards().catch(() => setCards([]));
  }, [loadCards]);

  if (section === 'posts') {
    const scoped = focusAccountId
      ? growth.filter((g) => g.accountId === focusAccountId)
      : growth;
    return (
      <SocialGrowthCards
        accounts={scoped.length > 0 ? scoped : growth}
        focusAccountId={focusAccountId}
        onFocusAccount={onFocusAccount}
      />
    );
  }

  if (cards === null) return <KpiSkeletonRow />;

  switch (section) {
    case 'cards':
      return <EventCardsKpis cards={cards} />;
    case 'updates':
      return <UpdatesKpis cards={cards} />;
    case 'automations':
      return <AutomationsKpis />;
    case 'analytics':
      return <AnalyticsKpis growth={growth} cards={cards} />;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}
