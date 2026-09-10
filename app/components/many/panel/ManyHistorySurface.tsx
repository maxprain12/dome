import { useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  PinIcon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import ManyIcon from '@/components/many/ManyIcon';
import { cn } from '@/lib/utils';

export interface ManyHistorySession {
  id: string;
  title: string;
  preview?: string;
  createdAt: number | null;
  updatedAt: number | null;
  pinned: boolean;
}

export interface ManyHistoryLabels {
  search: string;
  newChat: string;
  emptyTitle: string;
  emptyDescription: string;
  pinned: string;
  today: string;
  yesterday: string;
  thisWeek: string;
  older: string;
  pin: string;
  unpin: string;
  delete: string;
}

interface ManyHistorySurfaceProps {
  sessions: ManyHistorySession[];
  currentSessionId?: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onPinSession: (id: string, pinned: boolean) => void;
  onDeleteSession: (id: string) => void;
  labels: ManyHistoryLabels;
  manyImageSrc?: string;
  disabled?: boolean;
  className?: string;
}

interface HistorySection {
  id: string;
  label: string;
  sessions: ManyHistorySession[];
}

function timestamp(session: ManyHistorySession): number {
  return session.updatedAt ?? session.createdAt ?? 0;
}

function buildSections(
  sessions: ManyHistorySession[],
  labels: ManyHistoryLabels,
): HistorySection[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = now.getTime();
  const day = 86_400_000;
  const sections: HistorySection[] = [
    { id: 'pinned', label: labels.pinned, sessions: [] },
    { id: 'today', label: labels.today, sessions: [] },
    { id: 'yesterday', label: labels.yesterday, sessions: [] },
    { id: 'week', label: labels.thisWeek, sessions: [] },
    { id: 'older', label: labels.older, sessions: [] },
  ];
  for (const session of sessions) {
    const time = timestamp(session);
    const section = session.pinned
      ? sections[0]
      : time >= today
        ? sections[1]
        : time >= today - day
          ? sections[2]
          : time >= today - day * 6
            ? sections[3]
            : sections[4];
    section.sessions.push(session);
  }
  return sections.filter((section) => section.sessions.length > 0);
}

/** Searchable, grouped, mutable history shared by remote Many clients. */
export default function ManyHistorySurface({
  sessions,
  currentSessionId,
  query,
  onQueryChange,
  onSelectSession,
  onNewChat,
  onPinSession,
  onDeleteSession,
  labels,
  manyImageSrc,
  disabled = false,
  className,
}: ManyHistorySurfaceProps) {
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...sessions]
      .filter(
        (session) =>
          !normalized ||
          session.title.toLocaleLowerCase().includes(normalized) ||
          session.preview?.toLocaleLowerCase().includes(normalized),
      )
      .sort((left, right) => timestamp(right) - timestamp(left));
  }, [query, sessions]);
  const sections = useMemo(
    () => buildSections(filtered, labels),
    [filtered, labels],
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <InputGroup className="flex-1">
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            disabled={disabled}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </InputGroup>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onNewChat}
          disabled={disabled}
          aria-label={labels.newChat}
          title={labels.newChat}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <ManyIcon src={manyImageSrc} size={28} />
            <p className="mt-3 text-sm font-medium">{labels.emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {labels.emptyDescription}
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.sessions.map((session) => (
                  <li key={session.id} className="group/session relative">
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      disabled={disabled}
                      className={cn(
                        'flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 pr-16 text-left transition-colors hover:bg-muted/60',
                        session.id === currentSessionId && 'bg-muted',
                      )}
                    >
                      <span className="truncate text-[13px] font-medium">
                        {session.title}
                      </span>
                      {session.preview ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {session.preview}
                        </span>
                      ) : null}
                    </button>
                    <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center rounded-md bg-background/90 opacity-0 shadow-sm group-hover/session:opacity-100 group-focus-within/session:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onPinSession(session.id, !session.pinned)}
                        aria-label={session.pinned ? labels.unpin : labels.pin}
                        title={session.pinned ? labels.unpin : labels.pin}
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
                        onClick={() => onDeleteSession(session.id)}
                        aria-label={labels.delete}
                        title={labels.delete}
                      >
                        <HugeiconsIcon icon={Delete02Icon} />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
