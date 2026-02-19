import { memo, useState, useRef, useEffect } from 'react';
import { Trash2, X, Plus, MessageSquare } from 'lucide-react';
import ManyIcon from './ManyIcon';
import type { ManyChatSession } from '@/lib/store/useManyStore';

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  contextDescription: string;
  messagesCount: number;
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  /** Hint when loading: e.g. "Procesando datos...", "Ejecutando acciones..." */
  loadingHint?: string;
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
  sessions,
  currentSessionId,
  onClear,
  onStartNewChat,
  onSwitchSession,
  onDeleteSession,
  onClose,
  loadingHint,
}: ManyChatHeaderProps) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSessionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sessionsOpen]);

  const subtitle =
    status === 'thinking' ? 'Pensando...' : status === 'speaking' ? 'Respondiendo...' : (loadingHint || providerInfo || contextDescription);
  const showClear = messagesCount > 0 && status !== 'thinking' && status !== 'speaking';

  const sortedSessions = [...sessions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]">
        <ManyIcon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[var(--primary-text)]">Many</div>
        <div className="truncate text-[11px] text-[var(--tertiary-text)]">{subtitle}</div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onStartNewChat}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
          title="Nuevo chat"
          aria-label="Nuevo chat"
        >
          <Plus size={18} />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setSessionsOpen((v) => !v)}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)] ${sessionsOpen ? 'bg-[var(--bg-hover)] text-[var(--primary-text)]' : ''}`}
            title="Chats anteriores"
            aria-label="Chats anteriores"
            aria-expanded={sessionsOpen}
          >
            <MessageSquare size={16} />
          </button>
          {sessionsOpen && sortedSessions.length > 0 ? (
            <div
              className="absolute right-0 top-full z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-xl"
              role="listbox"
            >
              {sortedSessions.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center gap-2 px-2 py-1 mx-1 rounded-lg hover:bg-[var(--bg-secondary)]"
                  role="option"
                  aria-selected={s.id === currentSessionId}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchSession(s.id);
                      setSessionsOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[13px] text-[var(--primary-text)]"
                  >
                    {s.title || 'New chat'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteSession(s.id);
                      if (sessions.length <= 1) setSessionsOpen(false);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--tertiary-text)] opacity-0 transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--error)] group-hover:opacity-100"
                    aria-label="Eliminar chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
            title="Borrar chat"
            aria-label="Borrar historial del chat"
          >
            <Trash2 size={16} />
          </button>
        ) : null}

        <div className="mx-1 h-4 w-[1px] bg-[var(--border)]"></div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--tertiary-text)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
          aria-label="Cerrar chat"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});
