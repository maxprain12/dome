import { useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';

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
    (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewChat = () => {
    useManyStore.getState().startNewChat();
    const sessionId = useManyStore.getState().currentSessionId;
    if (sessionId) openChatTab(sessionId, 'New chat');
  };

  const handleOpenSession = (session: { id: string; title: string }) => {
    useManyStore.getState().switchSession(session.id);
    useTabStore.getState().openChatTab(session.id, session.title || 'Chat');
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    useManyStore.getState().deleteSession?.(sessionId);
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--dome-sidebar-bg)', width: '100%', minWidth: 240, borderLeft: '1px solid var(--dome-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0 px-3"
        style={{ height: 40, borderBottom: '1px solid var(--dome-border)' }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--dome-text-muted)' }}>
          Chats
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 26, height: 26, color: 'var(--dome-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title={t('chat.newChat')}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 26, height: 26, color: 'var(--dome-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Search */}
      {sessions.length > 4 && (
        <div className="px-3 py-2 shrink-0">
          <div
            className="flex items-center gap-1.5 rounded-md px-2"
            style={{ height: 26, background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
          >
            <Search className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={2} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('chat.searchPlaceholder')}
              className="flex-1 bg-transparent outline-none border-none"
              style={{ fontSize: 11.5, color: 'var(--dome-text)', caretColor: 'var(--dome-accent)' }}
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredSessions.length === 0 ? (
          <p className="text-center py-8 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {searchQuery ? t('chat.noResults') : t('chat.noChats')}
          </p>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="group flex items-center gap-2 mx-1.5 px-2 rounded-md cursor-pointer transition-colors"
                style={{
                  height: 32,
                  background: isActive ? 'var(--dome-surface)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span
                  className="flex-1 truncate"
                  style={{ fontSize: 12.5, color: isActive ? 'var(--dome-text)' : 'var(--dome-text-secondary)', fontWeight: isActive ? 500 : 400 }}
                >
                  {session.title || t('chat.newChat')}
                </span>
                <span
                  className="shrink-0 group-hover:hidden"
                  style={{ fontSize: 11, color: 'var(--dome-text-muted)' }}
                >
                  {timeAgo(session.createdAt ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="hidden group-hover:flex items-center justify-center rounded shrink-0 transition-colors"
                  style={{ width: 18, height: 18, color: 'var(--dome-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-error, #ef4444)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
                >
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
