import { useTranslation } from 'react-i18next';
import { FileText, MessageSquare, Zap, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardStats, HomeGamification } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';
import DomeCard from '@/components/ui/DomeCard';

function MiniStat({
  label,
  value,
  icon: Icon,
  iconTint,
  loading,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /**1–4: intensidad relativa sobre `var(--dome-accent)` */
  iconTint: 1 | 2 | 3 | 4;
  loading?: boolean;
}) {
  const mix =
    iconTint === 1 ? '14%' : iconTint === 2 ? '22%' : iconTint === 3 ? '34%' : '48%';

  return (
    <DomeCard
      padding="lg"
      className="rounded-[20px] border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))]"
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{
          background: `color-mix(in srgb, var(--dome-accent, var(--accent)) ${mix}, var(--dome-bg, var(--bg)))`,
          color: 'var(--dome-accent, var(--accent))',
        }}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      </span>
      <div className="mt-2">
        {loading ? (
          <span
            className="inline-block h-8 w-12 animate-pulse motion-reduce:animate-none rounded-md"
            style={{ background: 'var(--dome-border, var(--border))' }}
          />
        ) : (
          <span className="text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
            {value}
          </span>
        )}
        <p className="mt-1 text-xs font-medium" style={{ color: 'var(--dome-text-secondary, var(--tertiary-text))' }}>
          {label}
        </p>
      </div>
    </DomeCard>
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
          icon={Zap}
          iconTint={4}
          loading={loading}
        />
        <MiniStat label={t('dashboard.stat_resources')} value={stats.resourceCount} icon={FileText} iconTint={3} loading={loading} />
        <MiniStat label={t('dashboard.stat_chats')} value={stats.recentChats} icon={MessageSquare} iconTint={2} loading={loading} />
        <MiniStat label={t('dashboard.stat_flashcards')} value={stats.dueFlashcards} icon={WalletCards} iconTint={1} loading={loading} />
      </div>
    </section>
  );
}
