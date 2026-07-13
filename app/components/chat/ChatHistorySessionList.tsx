import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, PencilEdit02Icon, PinIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ManyChatSession } from '@/lib/store/useManyStore';
import { useManyStore } from '@/lib/store/useManyStore';
import ListState from '@/components/shared/ListState';
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
  const activeRunBySessionId = useManyStore((s) => s.activeRunBySessionId);

  if (sections.length === 0) {
    return (
      <div className={cn('chat-history-scroll flex flex-1 items-center justify-center min-h-0', className)}>
        <ListState variant="empty" compact title={emptyTitle} />
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
            const livePhase = activeRunBySessionId[session.id];

            return (
              <div key={session.id} className="chat-history-row-wrap group/row">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn('chat-history-row', isActive && 'chat-history-row--active')}
                  onClick={() => onSelectSession(session)}
                >
                  {livePhase ? (
                    <Spinner
                      className="chat-history-row-live"
                      aria-busy="true"
                      aria-label={t('chat.history_llm_active')}
                    />
                  ) : (
                    <span className="chat-history-row-live-spacer" aria-hidden />
                  )}
                  <div className="chat-history-row-body">
                  <div className="chat-history-row-title">
                    {session.pinned ? (
                      <HugeiconsIcon icon={PinIcon} className="chat-history-row-pin size-3" aria-hidden />
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
                  </div>
                </Button>
                <section className="chat-history-row-actions" aria-label={t('chat.chats_title')}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="chat-history-action-btn"
                    title={pinLabel}
                    aria-label={pinLabel}
                    onClick={(e) => {
                      e.stopPropagation();
                      useManyStore.getState().toggleSessionPin(session.id);
                    }}
                  >
                    <HugeiconsIcon icon={PinIcon} className={cn('size-3.5', session.pinned && 'fill-current')} />
                  </Button>
                  {onStartRename ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="chat-history-action-btn"
                      title={t('chat.rename_conversation')}
                      aria-label={t('chat.rename_conversation')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartRename(session);
                      }}
                    >
                      <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                    </Button>
                  ) : null}
                  {onDeleteSession ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="chat-history-action-btn chat-history-action-btn--danger"
                      title={t('chat.delete_conversation')}
                      aria-label={t('chat.delete_conversation')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                    </Button>
                  ) : null}
                </section>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
