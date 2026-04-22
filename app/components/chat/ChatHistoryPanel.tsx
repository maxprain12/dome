import { useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeListRow from '@/components/ui/DomeListRow';
import DomeListState from '@/components/ui/DomeListState';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface ChatHistoryPanelProps {
  onClose: () => void;
}

export default function ChatHistoryPanel({ onClose }: ChatHistoryPanelProps) {
  const { t } = useTranslation();
  const sessions = useManyStore((s) => s.sessions);
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const [searchQuery, setSearchQuery] = useState('');

  const { openChatTab } = useTabStore.getState();

  const filteredSessions = sessions.filter((s) =>
    (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleNewChat = () => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, t('chat.new_chat'));
  };

  const handleOpenSession = (session: { id: string; title: string }) => {
    useManyStore.getState().switchSession(session.id);
    useTabStore.getState().openChatTab(session.id, session.title || t('chat.new_chat'));
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    useManyStore.getState().deleteSession?.(sessionId);
  };

  const newChatLabel = t('chat.new_chat');

  return (
    <div
      className="flex flex-col h-full w-full min-w-[240px] border-l border-[var(--dome-border)]"
      style={{ background: 'var(--dome-sidebar-bg)' }}
    >
      <DomeSubpageHeader
        title={t('chat.chats_title')}
        className="!py-2 !px-3 !items-center border-b border-[var(--dome-border)] bg-transparent"
        trailing={
          <div className="flex items-center gap-0.5">
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              onClick={handleNewChat}
              className="!p-1 w-[26px] h-[26px] min-w-0 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)]"
              title={newChatLabel}
              aria-label={newChatLabel}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </DomeButton>
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onClose}
              className="!p-1 w-[26px] h-[26px] min-w-0 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)]"
              aria-label={t('chat.close_chat')}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </DomeButton>
          </div>
        }
      />

      <div className="px-3 py-2.5 shrink-0 border-b border-[var(--dome-border)] border-opacity-50">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 z-10 w-3.5 h-3.5 -translate-y-1/2 shrink-0 text-[var(--dome-text-muted)] pointer-events-none"
            strokeWidth={2}
            aria-hidden
          />
          <DomeInput
            className="gap-0"
            inputClassName="!h-[30px] !text-xs !py-0 pl-8 bg-[var(--dome-bg-hover)] border-[var(--dome-border)] text-[var(--dome-text)] caret-[var(--dome-accent)]"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('chat.search_placeholder')}
            aria-label={t('chat.search_placeholder')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1.5 min-h-0">
        {filteredSessions.length === 0 ? (
          <DomeListState
            variant="empty"
            compact
            title={searchQuery ? t('chat.no_results') : t('chat.no_chats')}
          />
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <DomeListRow
                key={session.id}
                title={session.title || newChatLabel}
                onClick={() => handleOpenSession(session)}
                trailing={
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="tabular-nums text-[11px] text-[var(--tertiary-text)] group-hover:hidden">
                      {timeAgo(session.createdAt ?? 0)}
                    </span>
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      className="hidden group-hover:flex !p-0.5 w-[22px] h-[22px] min-w-0 text-[var(--dome-text-muted)] hover:!text-[var(--dome-error,#ef4444)]"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      aria-label={t('chat.delete_conversation')}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </DomeButton>
                  </div>
                }
                className={cn(
                  'group w-full max-w-full mx-auto mb-0.5 px-2.5 py-2 rounded-lg border-0 border-l-[3px]',
                  isActive
                    ? 'bg-[var(--dome-surface)] border-l-[var(--dome-accent)] shadow-sm'
                    : 'border-l-transparent hover:bg-[var(--dome-bg-hover)]',
                )}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
