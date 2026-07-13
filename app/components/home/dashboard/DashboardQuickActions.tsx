import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  PlusSignIcon,
  Upload04Icon,
  CommentAdd01Icon,
  WalletCardsIcon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons';
import type { HomeQuickActionId } from '@/types';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

const ICONS: Record<HomeQuickActionId, IconSvgElement> = {
  newNote: PlusSignIcon,
  upload: Upload04Icon,
  newChat: CommentAdd01Icon,
  learn: WalletCardsIcon,
  calendar: Calendar03Icon,
};

const QUICK_ACTION_LABEL_KEYS: Record<HomeQuickActionId, string> = {
  newNote: 'dashboard.action_new_note',
  upload: 'dashboard.action_upload',
  newChat: 'dashboard.action_new_chat',
  learn: 'dashboard.action_learn',
  calendar: 'dashboard.action_calendar',
};

const QUICK_ACTION_DESC_KEYS: Record<HomeQuickActionId, string> = {
  newNote: 'dashboard.action_new_note_desc',
  upload: 'dashboard.action_upload_desc',
  newChat: 'dashboard.action_new_chat_desc',
  learn: 'dashboard.action_learn_desc',
  calendar: 'dashboard.action_calendar_desc',
};

export function DashboardQuickActions({
  orderedIds,
  onAction,
}: {
  orderedIds: HomeQuickActionId[];
  onAction: (id: HomeQuickActionId) => void;
}) {
  const { t } = useTranslation();

  if (orderedIds.length === 0) return null;

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.quick_actions')}</DashboardSectionLabel>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {orderedIds.map((id, index) => {
          const isPrimary = index === 0;
          return (
            <Button key={id}
  type="button"
  variant={isPrimary ? 'default' : 'outline'}
  className="h-auto min-h-[4.25rem] w-full justify-start gap-3 py-3.5 text-left"
  onClick={() => onAction(id)}>{<HugeiconsIcon icon={ICONS[id]} className="size-5 shrink-0" strokeWidth={2} aria-hidden />}
              <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="text-sm font-semibold leading-tight">{t(QUICK_ACTION_LABEL_KEYS[id])}</span>
                <span className={`text-xs font-medium ${isPrimary ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {t(QUICK_ACTION_DESC_KEYS[id])}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
