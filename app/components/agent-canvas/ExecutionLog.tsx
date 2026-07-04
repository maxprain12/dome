'use client';

import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Terminal, Clock, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import type { ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import type { CanvasExecutionStatus } from '@/lib/store/useCanvasStore';
import type { WorkflowExecution } from '@/types/canvas';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  buildHistorySelectOptions,
  countAgentProgress,
  getExecutionStatusPresentation,
  hasExecutionLogContent,
  resolveExecutionDisplay,
} from '@/lib/agent-canvas/executionLogDisplay';

interface ExecutionLogProps {
  entries: ExecutionLogEntry[];
  status: CanvasExecutionStatus;
  startTime: number | null;
  history?: WorkflowExecution[];
  selectedExecutionId?: string | null;
  onSelectExecution?: (id: string | null) => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const TYPE_STYLES = {
  info: { icon: Terminal, color: 'var(--dome-text-muted)' },
  tool_call: { icon: Wrench, color: 'var(--info)' },
  done: { icon: CheckCircle2, color: 'var(--success)' },
  error: { icon: AlertCircle, color: 'var(--error)' },
};

const EMPTY_HISTORY: WorkflowExecution[] = [];

function formatElapsedFromRange(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start;
  return formatElapsed(ms);
}

function ExecutionLogEntryRow({
  entry,
  timeLocale,
}: {
  entry: ExecutionLogEntry;
  timeLocale: string;
}) {
  const meta = TYPE_STYLES[entry.type];
  const EntryIcon = meta.icon;
  const time = new Date(entry.timestamp).toLocaleTimeString(timeLocale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div className="flex items-start gap-2 text-xs leading-relaxed">
      <span className="shrink-0 tabular-nums" style={{ color: 'var(--dome-text-muted)', fontSize: 12 }}>
        {time}
      </span>
      <EntryIcon className="size-3 shrink-0 mt-0.5" style={{ color: meta.color }} />
      <span className="font-semibold shrink-0" style={{ color: meta.color }}>
        [{entry.nodeLabel}]
      </span>
      <span style={{ color: 'var(--dome-text-secondary)', wordBreak: 'break-all' }}>
        {entry.message}
      </span>
    </div>
  );
}

export default function ExecutionLog({
  entries,
  status,
  startTime,
  history = EMPTY_HISTORY,
  selectedExecutionId = null,
  onSelectExecution,
}: ExecutionLogProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { selectedExecution, displayEntries, displayStartTime, displayStatus } =
    resolveExecutionDisplay(entries, status, startTime, history, selectedExecutionId);

  useLayoutEffect(() => {
    if (!collapsed && status === 'running') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, collapsed, status]);

  useEffect(() => {
    if (status !== 'running' || !startTime) {
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [status, startTime]);

  const prevStatusRef = useRef(status);
  if (status !== prevStatusRef.current) {
    prevStatusRef.current = status;
    if (status === 'running') setElapsed(0);
  }

  if (!hasExecutionLogContent(status, entries, history)) return null;

  const isLiveRunning = status === 'running';
  const { isRunning, isDone, statusColor, statusLabelKey } =
    getExecutionStatusPresentation(displayStatus);
  const { completedAgents, totalAgents } = countAgentProgress(displayEntries);
  const statusLabel = t(statusLabelKey);
  const timeLocale = getDateTimeLocaleTag();
  const historyOptions =
    history.length > 0 && onSelectExecution
      ? buildHistorySelectOptions(
          history,
          timeLocale,
          formatElapsedFromRange,
          t('canvas.exec_current_run'),
        )
      : null;

  return (
    <div
      className="shrink-0 border-t"
      style={{
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:opacity-80"
        style={{ background: 'var(--dome-bg)' }}
      >
        <div
          className={`size-2 rounded-full shrink-0 ${isLiveRunning ? 'animate-pulse' : ''}`}
          style={{ background: statusColor }}
        />
        <span className="text-xs font-semibold" style={{ color: statusColor }}>
          {statusLabel}
        </span>
        {isLiveRunning && (
          <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
            {formatElapsed(elapsed)}
          </span>
        )}
        {isDone && displayStartTime && !isLiveRunning && (
          <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <Clock className="size-3 inline mr-0.5 -mt-0.5" />
            {formatElapsedFromRange(displayStartTime, selectedExecution?.finishedAt)}
          </span>
        )}
        {totalAgents > 0 && (
          <span className="ml-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('canvas.exec_agents_count', { completed: completedAgents, total: totalAgents })}
          </span>
        )}
        <div className="flex-1" />
        {historyOptions && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- propagation guard only; the inner DomeSelectMenu owns all interaction.
          <div style={{ maxWidth: 180 }} onClick={(e) => e.stopPropagation()}>
            <DomeSelectMenu
              value={selectedExecutionId ?? ''}
              onChange={(v) => onSelectExecution?.(v || null)}
              fullWidth={false}
              aria-label={t('canvas.exec_current_run')}
              options={historyOptions}
            />
          </div>
        )}
        {collapsed ? (
          <ChevronUp className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        )}
      </button>

      {!collapsed && (
        <div
          className="overflow-y-auto px-4 py-2 space-y-1 font-mono"
          style={{ maxHeight: 180, background: 'var(--dome-bg)' }}
        >
          {displayEntries.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--dome-text-muted)' }}>
              {status === 'running' ? t('canvas.exec_starting') : t('canvas.exec_no_entries')}
            </p>
          )}
          {displayEntries.map((entry) => (
            <ExecutionLogEntryRow key={entry.id} entry={entry} timeLocale={timeLocale} />
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
