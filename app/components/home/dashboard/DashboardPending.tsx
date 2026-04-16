import { useTranslation } from 'react-i18next';
import { Calendar, WalletCards, PlayCircle, ChevronRight } from 'lucide-react';
import type { PendingTodayItem } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';
import DomeCard from '@/components/ui/DomeCard';

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

  function iconFor(kind: PendingTodayItem['kind']) {
    const cls = 'h-4 w-4 shrink-0';
    switch (kind) {
      case 'flashcards':
        return <WalletCards className={cls} strokeWidth={2} aria-hidden />;
      case 'calendar':
        return <Calendar className={cls} strokeWidth={2} aria-hidden />;
      case 'run':
        return <PlayCircle className={cls} strokeWidth={2} aria-hidden />;
      default:
        return null;
    }
  }

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
        <DomeCard
          padding="md"
          className="border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))]"
        >
          <p className="text-sm" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
            {t('dashboard.pending_empty')}
          </p>
        </DomeCard>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_pending')}</DashboardSectionLabel>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <DomeCard
              key={i}
              padding="sm"
              className="h-14 animate-pulse motion-reduce:animate-none border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))]"
            >
              <span className="sr-only">{t('common.loading')}</span>
            </DomeCard>
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
                  borderColor: 'var(--dome-border, var(--border))',
                  background: 'var(--dome-surface, var(--bg-secondary))',
                }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'var(--dome-bg, var(--bg))',
                    color: 'var(--dome-accent, var(--accent))',
                  }}
                >
                  {iconFor(item.kind)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
                    {titleFor(item)}
                  </p>
                  {item.kind === 'run' && item.subtitle ? (
                    <p className="truncate text-xs capitalize" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
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
