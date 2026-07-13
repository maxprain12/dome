import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon,
  WalletCardsIcon,
  PlayCircleIcon,
  ChevronRightIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import type { PendingTodayItem } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

function pendingItemIcon(kind: PendingTodayItem['kind']) {
  const cls = 'size-4 shrink-0';
  switch (kind) {
    case 'flashcards':
      return <HugeiconsIcon icon={WalletCardsIcon} className={cls} strokeWidth={2} aria-hidden />;
    case 'calendar':
      return <HugeiconsIcon icon={Calendar03Icon} className={cls} strokeWidth={2} aria-hidden />;
    case 'run':
      return <HugeiconsIcon icon={PlayCircleIcon} className={cls} strokeWidth={2} aria-hidden />;
    default:
      return null;
  }
}

export function DashboardPending({
  items,
  loading,
  onItemClick,
}: {
  items: PendingTodayItem[];
  loading: boolean;
  onItemClick: (item: PendingTodayItem) => void;
}) {
  const { t } = useTranslation();

  function titleFor(item: PendingTodayItem) {
    if (item.kind === 'flashcards') {
      const n = item.subtitle ?? '0';
      return t('dashboard.pending_flashcards', { count: Number(n) });
    }
    if (item.kind === 'calendar') {
      return item.title || t('dashboard.pending_event');
    }
    return item.title || t('dashboard.pending_run');
  }

  if (!loading && items.length === 0) {
    return (
      <section className="mb-8">
        <DashboardSectionLabel>{t('dashboard.section_pending')}</DashboardSectionLabel>
        <Card className="p-4 border-[var(--border)] bg-[var(--card)]">
          <p className="text-sm text-muted-foreground">
            {t('dashboard.pending_empty')}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_pending')}</DashboardSectionLabel>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card className="p-3 h-14 animate-pulse motion-reduce:animate-none border-[var(--border)] bg-[var(--card)]" key={i}>
              <span className="sr-only">{t('common.loading')}</span>
            </Card>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick(item)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 hover:opacity-95"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'var(--background)',
                    color: 'var(--primary)',
                  }}
                >
                  {pendingItemIcon(item.kind)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {titleFor(item)}
                  </p>
                  {item.kind === 'run' && item.subtitle ? (
                    <p className="truncate text-xs capitalize text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <HugeiconsIcon icon={ChevronRightIcon}
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
