import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  PinIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { HubSearch } from '@/components/hub/HubSearch';
import { HubSectionLabel } from '@/components/hub/HubSectionLabel';
import ManyIcon from '@/components/many/ManyIcon';
import { useManyStore, type ManyChatSession } from '@/lib/store/useManyStore';
import { filterOutDeletedSessions, deriveManySessionTitle } from '@/lib/store/manySessionStorage';
import { cn } from '@/lib/utils';

interface ManyHistoryViewProps {
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  className?: string;
}

interface HistorySection {
  id: string;
  label: string;
  sessions: ManyChatSession[];
}

function sessionTimestamp(session: ManyChatSession): number {
  return (
    session.updatedAt ??
    session.messages[session.messages.length - 1]?.timestamp ??
    session.createdAt
  );
}

function sessionPreview(session: ManyChatSession): string {
  const raw = session.messages[session.messages.length - 1]?.content ?? '';
  return raw
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function formatSessionTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function buildSections(sessions: ManyChatSession[], t: TFunction): HistorySection[] {
  const pinned = sessions.filter((s) => s.pinned);
  const rest = sessions.filter((s) => !s.pinned);

  const dayMs = 86_400_000;
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const todayStart = today0.getTime();
  const yesterdayStart = todayStart - dayMs;
  const weekStart = todayStart - 6 * dayMs;

  const buckets: Record<string, ManyChatSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };
  for (const session of rest) {
    const ts = sessionTimestamp(session);
    if (ts >= todayStart) buckets.today.push(session);
    else if (ts >= yesterdayStart) buckets.yesterday.push(session);
    else if (ts >= weekStart) buckets.week.push(session);
    else buckets.older.push(session);
  }

  const sections: HistorySection[] = [];
  if (pinned.length > 0) sections.push({ id: 'pinned', label: t('chat.group_pinned'), sessions: pinned });
  if (buckets.today.length > 0) sections.push({ id: 'today', label: t('many.history_today'), sessions: buckets.today });
  if (buckets.yesterday.length > 0) sections.push({ id: 'yesterday', label: t('many.history_yesterday'), sessions: buckets.yesterday });
  if (buckets.week.length > 0) sections.push({ id: 'week', label: t('many.history_this_week'), sessions: buckets.week });
  if (buckets.older.length > 0) sections.push({ id: 'older', label: t('many.history_before'), sessions: buckets.older });
  return sections;
}

/**
 * Conversation history: searchable, grouped by recency, pinned on top.
 * A live dot marks sessions with an active run.
 */
export default function ManyHistoryView({
  onSelectSession,
  onNewChat,
  className,
}: ManyHistoryViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const sessions = useManyStore((s) => s.sessions);
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const liveMessages = useManyStore((s) => s.messages);
  const activeRunBySessionId = useManyStore((s) => s.activeRunBySessionId);
  const deleteSession = useManyStore((s) => s.deleteSession);
  const toggleSessionPin = useManyStore((s) => s.toggleSessionPin);

  const visibleSessions = useMemo(() => {
    const visible = filterOutDeletedSessions(sessions);
    // The current draft only exists in memory until its first message lands in
    // the session list; surface it so "where did my chat go" never happens.
    if (
      currentSessionId &&
      liveMessages.length > 0 &&
      !visible.some((s) => s.id === currentSessionId)
    ) {
      const draft: ManyChatSession = {
        id: currentSessionId,
        title: deriveManySessionTitle({ messages: liveMessages }) || t('chat.new_chat'),
        messages: liveMessages,
        createdAt: liveMessages[0]?.timestamp ?? Date.now(),
        updatedAt: liveMessages[liveMessages.length - 1]?.timestamp ?? Date.now(),
      };
      return [draft, ...visible];
    }
    return visible;
  }, [sessions, currentSessionId, liveMessages, t]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return [...visibleSessions]
      .filter((s) => {
        if (!q) return true;
        if ((s.title || '').toLowerCase().includes(q)) return true;
        return s.messages.some((m) => m.content.toLowerCase().includes(q));
      })
      .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
  }, [visibleSessions, query]);

  const sections = useMemo(() => buildSections(filtered, t), [filtered, t]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <HubSearch
          className="flex-1"
          value={query}
          onChange={setQuery}
          placeholder={t('many.search_chats')}
          aria-label={t('many.search_chats')}
          clearLabel={t('common.cancel')}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onNewChat}
          aria-label={t('many.newChat')}
          title={t('many.newChat')}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sections.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ManyIcon size={22} />
              </EmptyMedia>
              <EmptyTitle>
                {query ? t('many.search_no_results') : t('many.history_empty')}
              </EmptyTitle>
              <EmptyDescription>{t('chat.many_welcome_subtitle')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="mb-2">
              <HubSectionLabel className="px-2 pb-1 pt-2">{section.label}</HubSectionLabel>
              <ul className="flex flex-col gap-0.5">
                {section.sessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  const runPhase = activeRunBySessionId[session.id];
                  const preview = sessionPreview(session);
                  return (
                    <li key={session.id} className="group/session relative">
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className={cn(
                          'flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 motion-reduce:transition-none',
                          isActive && 'bg-muted',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {runPhase ? (
                            <Spinner
                              className="size-3 shrink-0 text-primary"
                              aria-label={t('chat.history_llm_active')}
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {deriveManySessionTitle({
                              storedTitle: session.title,
                              messages: session.messages,
                            }) || t('chat.new_chat')}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {formatSessionTime(sessionTimestamp(session))}
                          </span>
                        </span>
                        {preview ? (
                          <span className="truncate text-xs text-muted-foreground">{preview}</span>
                        ) : null}
                      </button>
                      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-background/90 opacity-0 shadow-sm transition-opacity group-hover/session:opacity-100 group-focus-within/session:opacity-100 motion-reduce:transition-none">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => toggleSessionPin(session.id)}
                          aria-label={
                            session.pinned ? t('chat.unpin_conversation') : t('chat.pin_conversation')
                          }
                          title={
                            session.pinned ? t('chat.unpin_conversation') : t('chat.pin_conversation')
                          }
                        >
                          <HugeiconsIcon
                            icon={PinIcon}
                            className={cn(session.pinned && 'text-primary')}
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive"
                          onClick={() => void deleteSession(session.id)}
                          aria-label={t('chat.delete_conversation')}
                          title={t('chat.delete_conversation')}
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
