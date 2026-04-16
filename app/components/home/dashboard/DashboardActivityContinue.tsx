import { useTranslation } from 'react-i18next';
import { FileText, MessageSquare, ArrowRight } from 'lucide-react';
import type { ActivityItem } from '@/lib/hooks/useDashboardData';
import { formatDistanceToNow } from '@/lib/utils';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';
import DomeCard from '@/components/ui/DomeCard';

export function DashboardActivityContinue({
  activity,
  loading,
  onContinue,
}: {
  activity: ActivityItem[];
  loading: boolean;
  onContinue: (item: ActivityItem) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_continue')}</DashboardSectionLabel>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <DomeCard
              key={i}
              padding="sm"
              className="h-12 animate-pulse motion-reduce:animate-none border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))]"
            >
              <span className="sr-only">{t('common.loading')}</span>
            </DomeCard>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <DomeCard
          padding="lg"
          className="border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] text-center"
        >
          <p className="text-sm font-medium" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
            {t('dashboard.no_activity')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
            {t('dashboard.no_recent_hint')}
          </p>
        </DomeCard>
      ) : (
        <ul className="space-y-2">
          {activity.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onContinue(item)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 hover:opacity-95"
                style={{
                  borderColor: 'var(--dome-border, var(--border))',
                  background: 'var(--dome-surface, var(--bg-secondary))',
                }}
                disabled={item.kind === 'resource' ? !item.resourceId : !item.sessionId}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'var(--dome-bg, var(--bg))',
                    color: 'var(--dome-accent, var(--accent))',
                  }}
                >
                  {item.kind === 'resource' ? (
                    <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="truncate text-xs capitalize" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-xs" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
                  {formatDistanceToNow(item.timestamp)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--dome-accent, var(--accent))' }} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
