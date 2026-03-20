import { memo } from 'react';
import { Trash2, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ManyIcon from './ManyIcon';
import type { ManyChatSession } from '@/lib/store/useManyStore';

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  contextDescription: string;
  messagesCount: number;
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  loadingHint?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClear: () => void;
  onStartNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

export default memo(function ManyChatHeader({
  status,
  providerInfo,
  contextDescription,
  messagesCount,
  onClear,
  onStartNewChat,
  onClose,
  loadingHint,
}: ManyChatHeaderProps) {
  const { t } = useTranslation();
  const subtitle =
    status === 'thinking'
      ? t('many.thinking')
      : status === 'speaking'
        ? t('many.speaking')
        : (loadingHint || providerInfo || contextDescription);
  const showClear = messagesCount > 0 && status !== 'thinking' && status !== 'speaking';

  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]">
        <ManyIcon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[var(--primary-text)]">{t('many.many')}</div>
        <div className="truncate text-[11px] text-[var(--tertiary-text)]">{subtitle}</div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onStartNewChat}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
          title={t('many.newChat')}
          aria-label={t('many.newChat')}
        >
          <Plus size={18} />
        </button>

        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
            title={t('many.clear_chat')}
            aria-label={t('many.clear_chat_aria')}
          >
            <Trash2 size={16} />
          </button>
        ) : null}

        <div className="mx-1 h-4 w-[1px] bg-[var(--border)]"></div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
          aria-label={t('many.close_chat_aria')}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});
