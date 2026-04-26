import { useState, useMemo, type CSSProperties, type FormEvent } from 'react';
import { Search, X, Plus, Pin, Pencil, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeListRow from '@/components/ui/DomeListRow';
import DomeListState from '@/components/ui/DomeListState';

function timeAgo(ts: number, t: TFunction): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('chat.time_ago_seconds', { n: Math.max(0, seconds) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('chat.time_ago_minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('chat.time_ago_hours', { n: hours });
  const days = Math.floor(hours / 24);
  return t('chat.time_ago_days', { n: days });
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function monday0(today0: number): number {
  const d = new Date(today0);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

type GroupId = 'chat.group_today' | 'chat.group_yesterday' | 'chat.group_this_week' | 'chat.group_older';

function timeGroupKey(ts: number): { key: GroupId } {
  const t0 = startOfLocalDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const today0 = t0;
  const y0 = today0 - dayMs;
  const mt = new Date(ts);
  if (mt.getTime() >= today0 && mt.getTime() < today0 + dayMs) {
    return { key: 'chat.group_today' };
  }
  if (mt.getTime() >= y0 && mt.getTime() < today0) {
    return { key: 'chat.group_yesterday' };
  }
  const mon0 = monday0(today0);
  if (mt.getTime() >= mon0 && mt.getTime() < y0) {
    return { key: 'chat.group_this_week' };
  }
  return { key: 'chat.group_older' };
}

interface ChatHistoryPanelProps {
  onClose: () => void;
}

export default function ChatHistoryPanel({ onClose }: ChatHistoryPanelProps) {
  const { t } = useTranslation();
  const sessions = useManyStore((s) => s.sessions);
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const [searchQuery, setSearchQuery] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { openChatTab } = useTabStore.getState();

  const sortedSessions = useMemo(() => {
    const f = searchQuery.toLowerCase();
    return [...sessions]
      .filter((s) => (s.title || '').toLowerCase().includes(f))
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        const at = a.updatedAt ?? a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt;
        const bt = b.updatedAt ?? b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt;
        return bt - at;
      });
  }, [sessions, searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<GroupId, ManyChatSession[]>();
    for (const s of sortedSessions) {
      const ts = s.updatedAt ?? s.messages[s.messages.length - 1]?.timestamp ?? s.createdAt;
      const { key } = timeGroupKey(ts);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    const order: GroupId[] = [
      'chat.group_today',
      'chat.group_yesterday',
      'chat.group_this_week',
      'chat.group_older',
    ];
    return order
      .filter((k) => (map.get(k) ?? []).length > 0)
      .map((k) => ({ id: k, label: t(k), sessions: map.get(k)! }));
  }, [sortedSessions, t]);

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

  const handleStartRename = (e: React.MouseEvent, s: ManyChatSession) => {
    e.stopPropagation();
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
  const modalOverlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgb(0 0 0 / 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  return (
    <div
      className="flex flex-col h-full w-full min-w-[240px] border-l border-[var(--dome-border)]"
      style={{ background: 'var(--dome-sidebar-bg)' }}
    >
      {renameId ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3"
          style={modalOverlay}
          role="dialog"
          aria-modal
          onClick={() => setRenameId(null)}
        >
          <form
            onSubmit={handleApplyRename}
            onClick={(ev) => ev.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-[var(--dome-border)] bg-[var(--dome-surface)] p-3 shadow-lg"
            style={{ background: 'var(--dome-surface)' }}
          >
            <p className="text-xs font-medium text-[var(--dome-text)] mb-2">{t('chat.rename_conversation')}</p>
            <DomeInput
              className="gap-0 mb-3"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              inputClassName="!text-sm"
            />
            <div className="flex justify-end gap-2">
              <DomeButton type="button" variant="ghost" size="sm" onClick={() => setRenameId(null)}>
                {t('common.cancel')}
              </DomeButton>
              <DomeButton type="submit" variant="primary" size="sm" leftIcon={<Check className="w-3.5 h-3.5" />}>
                {t('common.save')}
              </DomeButton>
            </div>
          </form>
        </div>
      ) : null}

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
        {sortedSessions.length === 0 ? (
          <DomeListState
            variant="empty"
            compact
            title={searchQuery ? t('chat.no_results') : t('chat.no_chats')}
          />
        ) : (
          groups.map((g) => (
            <div key={g.id} className="mb-3 last:mb-0">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--dome-text-muted)]">
                {g.label}
              </p>
              {g.sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            const pinLabel = session.pinned ? t('chat.unpin_conversation') : t('chat.pin_conversation');
            return (
              <DomeListRow
                key={session.id}
                title={session.title || newChatLabel}
                onClick={() => handleOpenSession(session)}
                trailing={
                  <div className="flex items-center gap-1.5 shrink-0">
                    {session.pinned && (
                      <Pin className="w-3 h-3 text-[var(--dome-accent)]" fill="currentColor" aria-hidden />
                    )}
                    <span className="tabular-nums text-[11px] text-[var(--tertiary-text)] group-hover:hidden">
                      {timeAgo(session.updatedAt ?? session.messages[session.messages.length - 1]?.timestamp ?? session.createdAt, t)}
                    </span>
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      className="hidden group-hover:flex !p-0.5 w-[22px] h-[22px] min-w-0 text-[var(--dome-text-muted)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        useManyStore.getState().toggleSessionPin(session.id);
                      }}
                      title={pinLabel}
                      aria-label={pinLabel}
                    >
                      <Pin className="w-3.5 h-3.5" strokeWidth={2} />
                    </DomeButton>
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      className="hidden group-hover:flex !p-0.5 w-[22px] h-[22px] min-w-0 text-[var(--dome-text-muted)]"
                      onClick={(e) => handleStartRename(e, session)}
                      title={t('chat.rename_conversation')}
                      aria-label={t('chat.rename_conversation')}
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                    </DomeButton>
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
          })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
