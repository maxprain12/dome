import { useTranslation } from 'react-i18next';
import { FileText, MessageSquare, ArrowRight } from 'lucide-react';
import type { ActivityItem } from '@/lib/hooks/useDashboardData';
import { formatDistanceToNow } from '@/lib/utils';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

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
            <div key={i} className="h-12 animate-pulse motion-reduce:animate-none rounded-xl" style={{ background: 'var(--dome-surface)' }} />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {t('dashboard.no_activity')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('dashboard.no_recent_hint')}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {activity.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onContinue(item)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                disabled={
                  item.kind === 'resource' ? !item.resourceId : !item.sessionId
                }
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--dome-bg)', color: 'var(--dome-accent)' }}
                >
                  {item.kind === 'resource' ? (
                    <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="truncate text-xs capitalize" style={{ color: 'var(--dome-text-muted)' }}>
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {formatDistanceToNow(item.timestamp)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
