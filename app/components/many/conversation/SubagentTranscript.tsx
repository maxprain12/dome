import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { fetchSubagentMessages, listSubagentThreads } from '@/lib/chat/subagentThreads';
import { useManyStore } from '@/lib/store/useManyStore';
import type { ManyMessage } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

interface SubagentTranscriptProps {
  /** Subagent key from the delegation (`coding`, `research`, …). */
  agentKey: string;
  className?: string;
}

/**
 * The subagent's own transcript, on demand.
 *
 * A delegation shows only the text handed back to the supervisor; everything
 * the subagent reasoned and ran lives in its nested session. This opens that
 * session so the run is inspectable instead of a black box.
 *
 * Loaded lazily: most turns are never opened, and reading a JSONL session is
 * not worth doing for every card on screen.
 */
export default function SubagentTranscript({ agentKey, className }: SubagentTranscriptProps) {
  const { t } = useTranslation();
  const currentSessionId = useManyStore((s) => s.currentSessionId);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ManyMessage[] | null>(null);

  const load = useCallback(async () => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const threads = await listSubagentThreads(currentSessionId);
      const mine = threads.filter((thread) => thread.agentKey === agentKey.toLowerCase());
      // Several delegations to the same subagent can happen in one conversation;
      // the most recent is the one this card belongs to in practice.
      const target = mine[mine.length - 1];
      setMessages(target ? await fetchSubagentMessages(target.threadId) : []);
    } finally {
      setLoading(false);
    }
  }, [agentKey, currentSessionId]);

  useEffect(() => {
    if (open && messages === null && !loading) void load();
  }, [open, messages, loading, load]);

  const assistantTurns = (messages ?? []).filter((m) => m.role === 'assistant');

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-fit gap-1 px-1.5 text-[11px] text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')}
        />
        {t('chat.subagent_view_history', { defaultValue: "View the subagent's work" })}
      </Button>

      {open ? (
        <div className="ml-2 flex flex-col gap-2 border-l border-border pl-3">
          {loading ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner />
              {t('chat.subagent_history_loading', { defaultValue: 'Loading its transcript…' })}
            </span>
          ) : null}

          {!loading && assistantTurns.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {t('chat.subagent_history_empty', {
                defaultValue: 'No transcript stored for this delegation.',
              })}
            </span>
          ) : null}

          {assistantTurns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-1">
              {turn.thinking ? (
                <p className="whitespace-pre-wrap break-words text-[11.5px] italic text-muted-foreground">
                  {turn.thinking}
                </p>
              ) : null}

              {(turn.toolCalls ?? []).length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {(turn.toolCalls ?? []).map((call) => (
                    <li
                      key={call.id}
                      className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block size-1.5 shrink-0 rounded-full',
                          call.status === 'error' ? 'bg-destructive' : 'bg-success',
                        )}
                      />
                      <span className="truncate">{call.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {turn.content?.trim() ? (
                <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                  {turn.content}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
