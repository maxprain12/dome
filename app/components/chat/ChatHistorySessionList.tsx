import { Pin, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ManyChatSession } from '@/lib/store/useManyStore';
import { useManyStore } from '@/lib/store/useManyStore';
import DomeListState from '@/components/ui/DomeListState';
import type { ChatHistorySection } from './chatHistoryUtils';
import { displaySessionTitle, formatHistoryTime, sessionPreview } from './chatHistoryUtils';

interface ChatHistorySessionListProps {
  sections: ChatHistorySection[];
  currentSessionId: string | null;
  emptyTitle: string;
  onSelectSession: (session: ManyChatSession) => void;
  onStartRename?: (session: ManyChatSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  className?: string;
}

export default function ChatHistorySessionList({
  sections,
  currentSessionId,
  emptyTitle,
  onSelectSession,
  onStartRename,
  onDeleteSession,
  className,
}: ChatHistorySessionListProps) {
  const { t } = useTranslation();
  const newChatLabel = t('chat.new_chat');

  if (sections.length === 0) {
    return (
      <div className={cn('chat-history-scroll flex flex-1 items-center justify-center min-h-0', className)}>
        <DomeListState variant="empty" compact title={emptyTitle} />
      </div>
    );
  }

  return (
    <div className={cn('chat-history-scroll flex-1 min-h-0 overflow-y-auto', className)}>
      {sections.map((section) => (
        <div key={section.id} className="chat-history-section-block">
          <p className="chat-history-section-label">{section.label}</p>
          {section.sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            const preview = sessionPreview(session);
            const ts =
              session.updatedAt ??
              session.messages[session.messages.length - 1]?.timestamp ??
              session.createdAt;
            const timeLabel = formatHistoryTime(ts);
            const pinLabel = session.pinned
              ? t('chat.unpin_conversation')
              : t('chat.pin_conversation');

            return (
              <div key={session.id} className="chat-history-row-wrap group/row">
                <button
                  type="button"
                  className={cn('chat-history-row', isActive && 'chat-history-row--active')}
                  onClick={() => onSelectSession(session)}
                >
                  <div className="chat-history-row-title">
                    {session.pinned ? (
                      <Pin
                        className="chat-history-row-pin"
                        size={11}
                        strokeWidth={2}
                        fill="currentColor"
                        aria-hidden
                      />
                    ) : null}
                    <span className="min-w-0 truncate">
                      {displaySessionTitle(session, newChatLabel)}
                    </span>
                  </div>
                  {(preview || timeLabel) && (
                    <div className="chat-history-row-meta">
                      {preview ? (
                        <span className="chat-history-row-preview">{preview}</span>
                      ) : (
                        <span className="chat-history-row-preview chat-history-row-preview--empty" />
                      )}
                      <span className="chat-history-row-time chat-history-row-time--idle">
                        {timeLabel}
                      </span>
                    </div>
                  )}
                </button>
                <div className="chat-history-row-actions" role="group" aria-label={t('chat.chats_title')}>
                  <button
                    type="button"
                    className="chat-history-action-btn"
                    title={pinLabel}
                    aria-label={pinLabel}
                    onClick={(e) => {
                      e.stopPropagation();
                      useManyStore.getState().toggleSessionPin(session.id);
                    }}
                  >
                    <Pin
                      size={13}
                      strokeWidth={2}
                      fill={session.pinned ? 'currentColor' : 'none'}
                    />
                  </button>
                  {onStartRename ? (
                    <button
                      type="button"
                      className="chat-history-action-btn"
                      title={t('chat.rename_conversation')}
                      aria-label={t('chat.rename_conversation')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartRename(session);
                      }}
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                  ) : null}
                  {onDeleteSession ? (
                    <button
                      type="button"
                      className="chat-history-action-btn chat-history-action-btn--danger"
                      title={t('chat.delete_conversation')}
                      aria-label={t('chat.delete_conversation')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
