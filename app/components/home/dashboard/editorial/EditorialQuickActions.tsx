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
import { HomeSectionHeader } from '@/components/home/dashboard/editorial/HomeSectionHeader';

const ICONS: Record<HomeQuickActionId, LucideIcon> = {
  newNote: Plus,
  upload: Upload,
  newChat: MessageSquarePlus,
  learn: WalletCards,
  calendar: Calendar,
};

const KBD: Record<HomeQuickActionId, string> = {
  newNote: 'N',
  upload: 'U',
  newChat: 'C',
  learn: 'L',
  calendar: 'G',
};

const EDITORIAL_QUICK_ACTION_LABEL_KEYS: Record<HomeQuickActionId, string> = {
  newNote: 'dashboard.action_new_note',
  upload: 'dashboard.action_upload',
  newChat: 'dashboard.action_new_chat',
  learn: 'dashboard.action_learn',
  calendar: 'dashboard.action_calendar',
};

const EDITORIAL_QUICK_ACTION_DESC_KEYS: Record<HomeQuickActionId, string> = {
  newNote: 'dashboard.action_new_note_desc',
  upload: 'dashboard.action_upload_desc',
  newChat: 'dashboard.action_new_chat_desc',
  learn: 'dashboard.action_learn_desc',
  calendar: 'dashboard.action_calendar_desc',
};

export function EditorialQuickActions({
  orderedIds,
  onAction,
  onManage,
}: {
  orderedIds: HomeQuickActionId[];
  onAction: (id: HomeQuickActionId) => void;
  onManage?: () => void;
}) {
  const { t } = useTranslation();

  if (orderedIds.length === 0) return null;

  return (
    <section>
      <HomeSectionHeader
        title={t('dashboard.quick_actions')}
        linkLabel={t('dashboard.manage_actions')}
        onLinkClick={onManage}
      />
      <div className="h-quick">
        {orderedIds.map((id, index) => {
          const Icon = ICONS[id];
          const isPrimary = index === 0;
          return (
            <button
              key={id}
              type="button"
              className={`h-quick-btn ${isPrimary ? 'primary' : ''}`}
              onClick={() => onAction(id)}
            >
              <span className="kbd">{KBD[id]}</span>
              <span className="icon">
                <Icon size={16} strokeWidth={2} aria-hidden />
              </span>
              <span className="name">{t(EDITORIAL_QUICK_ACTION_LABEL_KEYS[id])}</span>
              <span className="sub">{t(EDITORIAL_QUICK_ACTION_DESC_KEYS[id])}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
