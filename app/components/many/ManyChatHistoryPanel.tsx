import { useState, useMemo } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ManyChatSession } from '@/lib/store/useManyStore';
import ChatHistorySessionList from '@/components/chat/ChatHistorySessionList';
import { buildChatHistorySections, filterAndSortSessions } from '@/components/chat/chatHistoryUtils';

interface ManyChatHistoryPanelProps {
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

export default function ManyChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onClose,
}: ManyChatHistoryPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const sortedSessions = useMemo(
    () => filterAndSortSessions(sessions, query),
    [sessions, query],
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
      />
    </div>
  );
}
