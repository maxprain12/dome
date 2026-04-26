import { memo } from 'react';
import { Trash2, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UnifiedChatHeader } from '@/components/chat/UnifiedChatHeader';
import ManyIcon from './ManyIcon';

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  contextDescription: string;
  messagesCount: number;
  loadingHint?: string;
  onClear: () => void;
  onStartNewChat: () => void;
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
    <UnifiedChatHeader
      left={<ManyIcon size={20} />}
      title={t('many.many')}
      subtitle={subtitle}
      actions={
        <>
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
          <div className="mx-1 h-4 w-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
            aria-label={t('many.close_chat_aria')}
          >
            <X size={18} />
          </button>
        </>
      }
    />
  );
});
