import { memo } from 'react';
import { Trash2, X, Plus } from 'lucide-react';
import ManyIcon from './ManyIcon';
import type { ManyChatSession } from '@/lib/store/useManyStore';

interface ManyChatHeaderProps {
  status: string;
  providerInfo: string;
  contextDescription: string;
  messagesCount: number;
  sessions: ManyChatSession[];
  currentSessionId: string | null;
  loadingHint?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
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
  onClear,
  onStartNewChat,
  onClose,
  loadingHint,
}: ManyChatHeaderProps) {
  const subtitle =
    status === 'thinking' ? 'Pensando...' : status === 'speaking' ? 'Respondiendo...' : (loadingHint || providerInfo || contextDescription);
  const showClear = messagesCount > 0 && status !== 'thinking' && status !== 'speaking';

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
