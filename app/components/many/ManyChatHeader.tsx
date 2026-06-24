import { memo, type ReactNode } from 'react';
import { X, Plus, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProviderModelChip } from '@/components/settings/ai/ProviderBrandIcon';
import ManyAvatar from './ManyAvatar';
import { sanitizeManySessionTitle } from '@/lib/store/manySessionStorage';

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  providerId?: string;
  contextDescription: string;
  messagesCount: number;
  loadingHint?: string;
  sessionTitle?: string;
  historyOpen?: boolean;
  onClear: () => void;
  onStartNewChat: () => void;
  onToggleHistory: () => void;
  onClose: () => void;
  /** When true (sidebar mode), shows the X close button */
  showClose?: boolean;
  /** Sidebar Many: overlay; fullscreen: columna derecha interna */
  showHistoryToggle?: boolean;
  /** Context window donut + popup */
  contextUsage?: ReactNode;
}

export default memo(function ManyChatHeader({
  status,
  providerInfo,
  providerId,
  contextDescription,
  messagesCount: _messagesCount,
  onClear: _onClear,
  onStartNewChat,
  onToggleHistory,
  onClose,
  loadingHint,
  sessionTitle,
  historyOpen = false,
  showClose = true,
  showHistoryToggle = true,
  contextUsage,
}: ManyChatHeaderProps) {
  const { t } = useTranslation();
  const isThinking = status === 'thinking';
  const isSpeaking = status === 'speaking';

  const titleText =
    sessionTitle && sessionTitle !== 'New chat'
      ? sanitizeManySessionTitle(sessionTitle)
      : t('many.many');
  const subtitleText = isThinking || isSpeaking ? null : loadingHint || null;

  return (
    <div
      className="flex items-center gap-3 shrink-0 border-b"
      style={{
        padding: '10px 16px',
        borderColor: 'var(--border)',
        background: 'var(--bg)',
      }}
    >
      {/* Avatar — static; status shown in title chip only */}
      <ManyAvatar size="md" state="idle" />

      {/* Title + subtitle */}
      <div className="min-w-0 flex-1 flex flex-col" style={{ gap: 2 }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--primary-text)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {titleText}
          </span>
          {(isThinking || isSpeaking) && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--accent)',
                fontWeight: 500,
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--accent-bg)',
                lineHeight: 1.6,
                flexShrink: 0,
              }}
            >
              {isThinking ? t('many.thinking') : t('many.speaking')}
            </span>
          )}
        </div>

        <div className="flex items-center flex-wrap" style={{ gap: 5 }}>
          {providerInfo ? (
            <span className="many-hd-chip">
              <ProviderModelChip provider={providerId ?? ''} label={providerInfo} />
            </span>
          ) : null}
          {contextDescription && (
            <span className="many-hd-chip many-hd-chip--accent">
              {contextDescription}
            </span>
          )}
          {subtitleText && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--tertiary-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {subtitleText}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center shrink-0" style={{ gap: 2 }}>
        {contextUsage}
        <button
          type="button"
          className="many-icon-btn"
          onClick={onStartNewChat}
          title={t('many.newChat')}
          aria-label={t('many.newChat')}
        >
          <Plus size={16} />
        </button>
        {showHistoryToggle ? (
          <button
            type="button"
            className="many-icon-btn"
            onClick={onToggleHistory}
            title={t('many.toggle_history')}
            aria-label={t('many.toggle_history')}
            style={historyOpen ? { background: 'var(--bg-hover)', color: 'var(--accent)' } : undefined}
          >
            <Clock size={14} />
          </button>
        ) : null}
        {showClose && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
            <button
              type="button"
              className="many-icon-btn"
              onClick={onClose}
              aria-label={t('many.close_chat_aria')}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
