import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  PinIcon,
  PlusSignIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { HubSearch } from '@/components/hub/HubSearch';
import { SidebarGroupLabel } from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
      <div className="flex shrink-0 flex-col gap-2 border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium">{t('many.history')}</h2>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onNewChat} aria-label={t('many.newChat')} title={t('many.newChat')}><HugeiconsIcon icon={PlusSignIcon} /></Button>
        </div>
        <HubSearch
          className="flex-1"
          value={query}
          onChange={setQuery}
          placeholder={t('many.search_chats')}
          aria-label={t('many.search_chats')}
          clearLabel={t('common.cancel')}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
      <div className="px-2 pb-3">
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
              <SidebarGroupLabel className="mt-2 h-7 px-2">{section.label}</SidebarGroupLabel>
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
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 w-full flex-col justify-center gap-1 rounded-md px-2 py-2 pr-8 text-left outline-none transition-colors hover:bg-background/60 focus-visible:ring-1 focus-visible:ring-sidebar-ring motion-reduce:transition-none',
                          isActive && 'bg-background shadow-xs',
                        )}
                      >
                        <span className="flex w-full min-w-0 items-center gap-1.5">
                          {runPhase ? (
                            <Spinner
                              className="size-3 shrink-0 text-primary"
                              aria-label={t('chat.history_llm_active')}
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[13px]">
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
                          <span className="block w-full truncate text-[11px] leading-4 text-muted-foreground">{preview}</span>
                        ) : null}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" className="absolute right-1 top-2 opacity-50 hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100" aria-label={t('many.conversation_actions')} title={t('many.conversation_actions')} />}>
                          <HugeiconsIcon icon={MoreHorizontalIcon} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="bottom" align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => toggleSessionPin(session.id)}><HugeiconsIcon icon={PinIcon} />{session.pinned ? t('chat.unpin_conversation') : t('chat.pin_conversation')}</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => void deleteSession(session.id)}><HugeiconsIcon icon={Delete02Icon} />{t('chat.delete_conversation')}</DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      </ScrollArea>
    </div>
  );
}
