import { useState, useMemo, startTransition, type FormEvent } from 'react';
import { Search, X, Plus, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { filterOutDeletedSessions } from '@/lib/store/manySessionStorage';
import { useTabStore } from '@/lib/store/useTabStore';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import ChatHistorySessionList from './ChatHistorySessionList';
import { buildChatHistorySections, filterAndSortSessions } from './chatHistoryUtils';

interface ChatHistoryPanelProps {
  onClose: () => void;
  /** Columna derecha dentro de Many fullscreen. */
  placement?: 'shell-right' | 'inline-right';
}

export default function ChatHistoryPanel({ onClose, placement = 'shell-right' }: ChatHistoryPanelProps) {
  const { t } = useTranslation();
  const sessions = useManyStore((s) => filterOutDeletedSessions(s.sessions));
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const [searchQuery, setSearchQuery] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sortedSessions = useMemo(
    () => filterAndSortSessions(sessions, searchQuery),
    [sessions, searchQuery],
  );

  const sections = useMemo(
    () => buildChatHistorySections(sortedSessions, t),
    [sortedSessions, t],
  );

  const handleNewChat = () => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) useTabStore.getState().openChatTab(sessionId, t('chat.new_chat'));
  };

  const handleOpenSession = (session: ManyChatSession) => {
    if (session.id === currentSessionId) return;
    startTransition(() => {
      useManyStore.getState().switchSession(session.id);
    });
    useTabStore.getState().openChatTab(session.id, session.title || t('chat.new_chat'));
  };

  const handleDeleteSession = (sessionId: string) => {
    void useManyStore.getState().deleteSession(sessionId);
  };

  const handleStartRename = (s: ManyChatSession) => {
    setRenameId(s.id);
    setRenameValue(s.title || t('chat.new_chat'));
  };

  const handleApplyRename = (e: FormEvent) => {
    e.preventDefault();
    if (renameId && renameValue.trim()) {
      useManyStore.getState().updateSessionTitle(renameId, renameValue.trim());
    }
    setRenameId(null);
  };

  const newChatLabel = t('chat.new_chat');
  const emptyTitle = searchQuery ? t('chat.no_results') : t('chat.no_chats');

  return (
    <div
      className={cn(
        'chat-history-panel',
        placement === 'inline-right' && 'chat-history-panel--inline-right',
      )}
    >
      {renameId ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3" role="presentation">
          <button
            type="button"
            className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
            style={{ background: 'rgb(0 0 0 / 0.45)' }}
            aria-label={t('common.close')}
            onClick={() => setRenameId(null)}
          />
          <form
            onSubmit={handleApplyRename}
            className="relative z-10 w-full max-w-sm rounded-lg border border-[var(--dome-border)] bg-[var(--dome-surface)] p-3 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-rename-dialog-title"
          >
            <p id="chat-rename-dialog-title" className="text-xs font-medium text-[var(--dome-text)] mb-2">
              {t('chat.rename_conversation')}
            </p>
            <DomeInput
              className="gap-0 mb-3"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              inputClassName="!text-sm"
            />
            <div className="flex justify-end gap-2">
              <DomeButton type="button" variant="ghost" size="sm" onClick={() => setRenameId(null)}>
                {t('common.cancel')}
              </DomeButton>
              <DomeButton type="submit" variant="primary" size="sm" leftIcon={<Check className="size-3.5" />}>
                {t('common.save')}
              </DomeButton>
            </div>
          </form>
        </div>
      ) : null}

      <header className="chat-history-hd">
        <h3 className="chat-history-hd__title">{t('chat.chats_title')}</h3>
        <button
          type="button"
          className="many-icon-btn"
          onClick={handleNewChat}
          title={newChatLabel}
          aria-label={newChatLabel}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="many-icon-btn"
          onClick={onClose}
          aria-label={t('chat.close_chat')}
        >
          <X size={14} />
        </button>
      </header>

      <div className="chat-history-search">
        <label className="chat-history-search-box">
          <Search size={13} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('many.search_chats')}
            aria-label={t('many.search_chats')}
          />
        </label>
      </div>

      <ChatHistorySessionList
        sections={sections}
        currentSessionId={currentSessionId}
        emptyTitle={emptyTitle}
        onSelectSession={handleOpenSession}
        onStartRename={handleStartRename}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  );
}
