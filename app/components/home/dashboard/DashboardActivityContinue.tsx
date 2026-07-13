import { HugeiconsIcon } from '@hugeicons/react';
import {
  File02Icon,
  Comment01Icon,
  ArrowRight02Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
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
            <Card className="p-3 h-12 animate-pulse motion-reduce:animate-none border-[var(--border)] bg-[var(--card)]" key={i}>
              <span className="sr-only">{t('common.loading')}</span>
            </Card>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <Card className="p-6 border-[var(--border)] bg-[var(--card)] text-center">
          <p className="text-sm font-medium text-foreground">
            {t('dashboard.no_activity')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('dashboard.no_recent_hint')}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {activity.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onContinue(item)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 hover:opacity-95"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
                disabled={item.kind === 'resource' ? !item.resourceId : !item.sessionId}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'var(--background)',
                    color: 'var(--primary)',
                  }}
                >
                  {item.kind === 'resource' ? (
                    <HugeiconsIcon icon={File02Icon} className="size-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <HugeiconsIcon icon={Comment01Icon} className="size-4" strokeWidth={2} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="truncate text-xs capitalize text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {formatDistanceToNow(item.timestamp)}
                </span>
                <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5 shrink-0 text-primary" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
