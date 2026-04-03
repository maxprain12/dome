import { useTranslation } from 'react-i18next';
import {
  Plus,
  Upload,
  MessageSquarePlus,
  WalletCards,
  Calendar,
} from 'lucide-react';
import type { HomeQuickActionId } from '@/types';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

const ICONS: Record<HomeQuickActionId, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  newNote: Plus,
  upload: Upload,
  newChat: MessageSquarePlus,
  learn: WalletCards,
  calendar: Calendar,
};

function QuickActionBtn({
  label,
  description,
  icon: Icon,
  onClick,
  variant = 'default',
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  onClick: () => void;
  variant?: 'primary' | 'default';
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-4 rounded-[20px] border px-5 py-4 text-left transition-all duration-150"
      style={{
        background: isPrimary ? 'var(--dome-accent)' : 'var(--dome-surface)',
        borderColor: isPrimary ? 'transparent' : 'var(--dome-border)',
        color: isPrimary ? '#fff' : 'var(--dome-text)',
        boxShadow: isPrimary ? '0 4px 16px rgba(124,111,205,0.25)' : 'none',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (isPrimary) {
          el.style.boxShadow = '0 6px 20px rgba(124,111,205,0.35)';
          el.style.transform = 'translateY(-2px)';
        } else {
          el.style.borderColor = 'var(--dome-accent)';
          el.style.boxShadow = '0 0 0 1px rgba(124,111,205,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (isPrimary) {
          el.style.boxShadow = '0 4px 16px rgba(124,111,205,0.25)';
          el.style.transform = '';
        } else {
          el.style.borderColor = 'var(--dome-border)';
          el.style.boxShadow = 'none';
        }
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: isPrimary ? 'rgba(255,255,255,0.25)' : 'var(--dome-bg)',
          color: isPrimary ? '#fff' : 'var(--dome-text-secondary)',
          border: isPrimary ? '1px solid rgba(255,255,255,0.2)' : 'none',
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight">{label}</p>
        <p
          className="mt-1 truncate text-xs font-medium"
          style={{ color: isPrimary ? 'rgba(255,255,255,0.8)' : 'var(--dome-text-muted)' }}
        >
          {description}
        </p>
      </div>
    </button>
  );
}

export function DashboardQuickActions({
  orderedIds,
  onAction,
}: {
  orderedIds: HomeQuickActionId[];
  onAction: (id: HomeQuickActionId) => void;
}) {
  const { t } = useTranslation();

  const labelKey: Record<HomeQuickActionId, string> = {
    newNote: 'dashboard.action_new_note',
    upload: 'dashboard.action_upload',
    newChat: 'dashboard.action_new_chat',
    learn: 'dashboard.action_learn',
    calendar: 'dashboard.action_calendar',
  };

  const descKey: Record<HomeQuickActionId, string> = {
    newNote: 'dashboard.action_new_note_desc',
    upload: 'dashboard.action_upload_desc',
    newChat: 'dashboard.action_new_chat_desc',
    learn: 'dashboard.action_learn_desc',
    calendar: 'dashboard.action_calendar_desc',
  };

  if (orderedIds.length === 0) return null;

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.quick_actions')}</DashboardSectionLabel>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {orderedIds.map((id, index) => {
          const Icon = ICONS[id];
          return (
            <QuickActionBtn
              key={id}
              label={t(labelKey[id])}
              description={t(descKey[id])}
              icon={Icon}
              onClick={() => onAction(id)}
              variant={index === 0 ? 'primary' : 'default'}
            />
          );
        })}
      </div>
    </section>
  );
}
