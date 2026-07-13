import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { File02Icon, Comment01Icon, ZapIcon, WalletCardsIcon } from '@hugeicons/core-free-icons';
import type { DashboardStats, HomeGamification } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

function MiniStat({
  label,
  value,
  icon,
  iconTint,
  loading,
}: {
  label: string;
  value: string | number;
  icon: IconSvgElement;
  /**1–4: intensidad relativa sobre `var(--primary)` */
  iconTint: 1 | 2 | 3 | 4;
  loading?: boolean;
}) {
  const mix =
    iconTint === 1 ? '14%' : iconTint === 2 ? '22%' : iconTint === 3 ? '34%' : '48%';

  return (
    <Card className="p-6 rounded-[20px] border-[var(--border)] bg-[var(--card)]">
      <span
        className="flex size-8 items-center justify-center rounded-lg"
        style={{
          background: `color-mix(in srgb, var(--primary) ${mix}, var(--background))`,
          color: 'var(--primary)',
        }}
      >
        <HugeiconsIcon icon={icon} className="size-4 shrink-0" strokeWidth={2.5} />
      </span>
      <div className="mt-2">
        {loading ? (
          <span
            className="inline-block h-8 w-12 animate-pulse motion-reduce:animate-none rounded-md bg-border"
          />
        ) : (
          <span className="text-2xl font-bold tabular-nums sm:text-3xl text-foreground">
            {value}
          </span>
        )}
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      </div>
    </Card>
  );
}

export function DashboardMomentum({
  stats,
  gamification,
  loading,
}: {
  stats: DashboardStats;
  gamification: HomeGamification;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_momentum')}</DashboardSectionLabel>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniStat
          label={t('dashboard.momentum_label')}
          value={`${gamification.momentumPercent}%`}
          icon={ZapIcon}
          iconTint={4}
          loading={loading}
        />
        <MiniStat label={t('dashboard.stat_resources')} value={stats.resourceCount} icon={File02Icon} iconTint={3} loading={loading} />
        <MiniStat label={t('dashboard.stat_chats')} value={stats.recentChats} icon={Comment01Icon} iconTint={2} loading={loading} />
        <MiniStat label={t('dashboard.stat_flashcards')} value={stats.dueFlashcards} icon={WalletCardsIcon} iconTint={1} loading={loading} />
      </div>
    </section>
  );
}
