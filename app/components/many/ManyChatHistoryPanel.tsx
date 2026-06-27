import { useState, useMemo } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { filterOutDeletedSessions, deriveManySessionTitle } from '@/lib/store/manySessionStorage';
import ChatHistorySessionList from '@/components/chat/ChatHistorySessionList';
import { buildChatHistorySections, filterAndSortSessions } from '@/components/chat/chatHistoryUtils';

interface ManyChatHistoryPanelProps {
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession?: (id: string) => void;
  onClose: () => void;
}

export default function ManyChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onClose,
}: ManyChatHistoryPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const liveMessages = useManyStore((s) => s.messages);

  const sessionsForList = useMemo(() => {
    const visible = filterOutDeletedSessions(sessions);
    // Only surface the current session as an "orphan" row if it has real
    // messages. An empty draft (fresh "New chat") must NOT appear in history.
    if (!currentSessionId || liveMessages.length === 0 || visible.some((s) => s.id === currentSessionId)) {
      return visible;
    }
    const orphan: ManyChatSession = {
      id: currentSessionId,
      title: deriveManySessionTitle({ messages: liveMessages }) || t('chat.new_chat'),
      messages: liveMessages,
      createdAt: liveMessages[0]?.timestamp ?? Date.now(),
      updatedAt: liveMessages[liveMessages.length - 1]?.timestamp ?? Date.now(),
    };
    return [orphan, ...visible];
  }, [sessions, currentSessionId, liveMessages, t]);

  const sortedSessions = useMemo(
    () => filterAndSortSessions(sessionsForList, query),
    [sessionsForList, query],
  );

  const sections = useMemo(
    () => buildChatHistorySections(sortedSessions, t),
    [sortedSessions, t],
  );

  const emptyTitle = query ? t('many.search_no_results') : t('many.history_empty');

  return (
    <div
      className="many-history-panel chat-history-panel"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
      }}
    >
      <header className="chat-history-hd">
        <h3 className="chat-history-hd__title">{t('many.history')}</h3>
        <button
          type="button"
          className="many-icon-btn"
          onClick={onNewChat}
          title={t('many.newChat')}
          aria-label={t('many.newChat')}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="many-icon-btn"
          onClick={onClose}
          aria-label={t('many.close_chat_aria')}
        >
          <X size={14} />
        </button>
      </header>

      <div className="chat-history-search">
        <label className="chat-history-search-box">
          <Search size={13} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('many.search_chats')}
            aria-label={t('many.search_chats')}
          />
        </label>
      </div>

      <ChatHistorySessionList
        sections={sections}
        currentSessionId={currentSessionId}
        emptyTitle={emptyTitle}
        onSelectSession={(session) => {
          onSelectSession(session.id);
          onClose();
        }}
        onDeleteSession={onDeleteSession}
      />
    </div>
  );
}
