import { useTranslation } from 'react-i18next';
import {
  Plus,
  Upload,
  MessageSquarePlus,
  WalletCards,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HomeQuickActionId } from '@/types';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';
import DomeButton from '@/components/ui/DomeButton';

const ICONS: Record<HomeQuickActionId, LucideIcon> = {
  newNote: Plus,
  upload: Upload,
  newChat: MessageSquarePlus,
  learn: WalletCards,
  calendar: Calendar,
};

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
          const isPrimary = index === 0;
          return (
            <DomeButton
              key={id}
              type="button"
              variant={isPrimary ? 'primary' : 'outline'}
              size="md"
              className="h-auto min-h-[4.25rem] w-full justify-start gap-3 py-3.5 text-left"
              leftIcon={<Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />}
              onClick={() => onAction(id)}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="text-sm font-semibold leading-tight">{t(labelKey[id])}</span>
                <span className={`text-xs font-medium ${isPrimary ? 'text-white/80' : 'text-[var(--tertiary-text)]'}`}>
                  {t(descKey[id])}
                </span>
              </span>
            </DomeButton>
          );
        })}
      </div>
    </section>
  );
}
