/**
 * ThreadTimeline — Time-travel UI for agent thread checkpoints.
 *
 * Shows the ordered list of checkpoints for a thread, allows the user to
 * inspect checkpoint state, and fork execution from any historical point.
 *
 * Usage:
 *   <ThreadTimeline threadId="session_abc123" />
 */

import { HugeiconsIcon } from '@hugeicons/react';
import {
  Clock01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  GitBranchIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface CheckpointEntry {
  checkpointId: string;
  parentId: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  channel_values?: Record<string, unknown>;
}

interface ThreadTimelineProps {
  threadId: string;
  onFork?: (threadId: string, checkpointId: string) => void;
  className?: string;
}

function formatTs(ts?: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function CheckpointRow({
  entry,
  idx,
  total,
  onFork,
}: {
  entry: CheckpointEntry;
  idx: number;
  total: number;
  onFork?: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const stepLabel = entry.metadata?.step != null
    ? `Step ${entry.metadata.step}`
    : `Checkpoint ${total - idx}`;
  const source = typeof entry.metadata?.source === 'string' ? entry.metadata.source : null;
  const isLatest = idx === 0;

  return (
    <div className={`relative pl-5 ${idx < total - 1 ? 'pb-3' : ''}`}>
      {/* Timeline spine */}
      {idx < total - 1 && (
        <div className="absolute left-1.5 top-3 bottom-0 w-px bg-[var(--border)]" />
      )}
      {/* Node dot */}
      <div
        className={`absolute left-0 top-1.5 size-3 rounded-full border-2 ${
          isLatest
            ? 'border-primary bg-primary'
            : 'border-border bg-card'
        }`}
      />

      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium ${isLatest ? 'text-primary' : 'text-foreground'}`}>
              {stepLabel}
            </span>
            {source && (
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                {source}
              </span>
            )}
            {isLatest && (
              <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary">
                {t('threads.latest')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{formatTs(entry.createdAt)}</p>
          {entry.checkpointId && (
            <p className="mt-0.5 truncate text-[9px] font-mono text-muted-foreground">
              {entry.checkpointId.slice(0, 16)}…
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onFork && !isLatest && (
            <button
              type="button"
              title={t('threads.fork_from_here')}
              onClick={onFork}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={GitBranchIcon} size={10} />
              {t('threads.fork')}
            </button>
          )}
          {entry.channel_values && (
            <button
              type="button"
              title={t('threads.view_state')}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
            >
              {expanded ? <HugeiconsIcon icon={ChevronUpIcon} size={10} /> : <HugeiconsIcon icon={ChevronDownIcon} size={10} />}
            </button>
          )}
        </div>
      </div>

      {expanded && entry.channel_values && (
        <pre className="mt-1.5 overflow-x-auto rounded border border-border bg-card p-2 text-[9px] text-muted-foreground">
          {JSON.stringify(entry.channel_values, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ThreadTimeline({ threadId, onFork, className }: ThreadTimelineProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<CheckpointEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.threads.getHistory(threadId, 50);
      if (result?.error) {
        setError(result.error);
      } else {
        setHistory(Array.isArray(result?.history) ? (result.history as CheckpointEntry[]) : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Clock01Icon} size={13} className="text-muted-foreground" />
          <span className="text-[12px] font-medium text-foreground">
            {t('threads.timeline')}
          </span>
          {history.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {history.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <HugeiconsIcon icon={RefreshIcon} size={10} className={loading ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {loading && history.length === 0 && (
        <div className="flex items-center gap-1.5 py-4 text-[11px] text-muted-foreground">
          <HugeiconsIcon icon={RefreshIcon} size={11} className="animate-spin" />
          {t('common.loading')}
        </div>
      )}

      {error && (
        <p className="rounded border border-[var(--destructive)]/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && history.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          {t('threads.no_history')}
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-0">
          {history.map((entry, idx) => (
            <CheckpointRow
              key={entry.checkpointId ?? idx}
              entry={entry}
              idx={idx}
              total={history.length}
              onFork={
                onFork
                  ? () => onFork(threadId, entry.checkpointId)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
