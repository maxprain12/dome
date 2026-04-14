import { useTranslation } from 'react-i18next';
import { FileText, MessageSquare, Zap, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardStats, HomeGamification } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

function MiniStat({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[20px] border p-5 sm:p-6"
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: iconBg, color: iconColor }}>
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      </span>
      <div className="mt-2">
        {loading ? (
          <span className="inline-block h-8 w-12 animate-pulse motion-reduce:animate-none rounded-md" style={{ background: 'var(--dome-border)' }} />
        ) : (
          <span className="text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: 'var(--dome-text)' }}>
            {value}
          </span>
        )}
        <p className="mt-1 text-xs font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
          {label}
        </p>
      </div>
    </div>
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
          iconColor="#f59e0b"
          iconBg="rgba(245,158,11,0.12)"
          loading={loading}
        />
        <MiniStat
          label={t('dashboard.stat_resources')}
          value={stats.resourceCount}
          icon={FileText}
          iconColor="#7c6fcd"
          iconBg="rgba(124,111,205,0.12)"
          loading={loading}
        />
        <MiniStat
          label={t('dashboard.stat_chats')}
          value={stats.recentChats}
          icon={MessageSquare}
          iconColor="#3b82f6"
          iconBg="rgba(59,130,246,0.12)"
          loading={loading}
        />
        <MiniStat
          label={t('dashboard.stat_flashcards')}
          value={stats.dueFlashcards}
          icon={WalletCards}
          iconColor="#10b981"
          iconBg="rgba(16,185,129,0.12)"
          loading={loading}
        />
      </div>
    </section>
  );
}
