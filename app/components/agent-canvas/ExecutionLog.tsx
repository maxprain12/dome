'use client';

import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDownIcon as ChevronDownIcon,
  ChevronUpIcon as ChevronUpIcon,
  TerminalIcon as TerminalIcon,
  Clock01Icon as ClockIcon,
  CheckmarkCircle02Icon as CheckCircle2Icon,
  AlertCircleIcon as AlertCircleIcon,
  Wrench01Icon as WrenchIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReactNode } from 'react';

const Terminal = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TerminalIcon} {...props} />
);
const CheckCircle2 = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={CheckCircle2Icon} {...props} />
);
const AlertCircle = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={AlertCircleIcon} {...props} />
);
const Wrench = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={WrenchIcon} {...props} />
);
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
  info: { icon: Terminal, color: 'var(--muted-foreground)' },
  tool_call: { icon: Wrench, color: 'var(--info)' },
  done: { icon: CheckCircle2, color: 'var(--success)' },
  error: { icon: AlertCircle, color: 'var(--destructive)' },
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
      <span className="shrink-0 tabular-nums" style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
        {time}
      </span>
      <EntryIcon className="size-3 shrink-0 mt-0.5" style={{ color: meta.color }} />
      <span className="font-semibold shrink-0" style={{ color: meta.color }}>
        [{entry.nodeLabel}]
      </span>
      <span style={{ color: 'var(--muted-foreground)', wordBreak: 'break-all' }}>
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
  const { isDone, statusColor, statusLabelKey } =
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
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:opacity-80"
        style={{ background: 'var(--background)' }}
      >
        <div
          className={`size-2 rounded-full shrink-0 ${isLiveRunning ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ background: statusColor }}
        />
        <span className="text-xs font-semibold" style={{ color: statusColor }}>
          {statusLabel}
        </span>
        {isLiveRunning && (
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        )}
        {isDone && displayStartTime && !isLiveRunning && (
          <span className="text-xs text-muted-foreground">
            <HugeiconsIcon icon={ClockIcon} className="size-3 inline mr-0.5 -mt-0.5" />
            {formatElapsedFromRange(displayStartTime, selectedExecution?.finishedAt)}
          </span>
        )}
        {totalAgents > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">
            {t('canvas.exec_agents_count', { completed: completedAgents, total: totalAgents })}
          </span>
        )}
        <div className="flex-1" />
        {historyOptions && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- propagation guard only; the inner Select owns all interaction.
          <div style={{ maxWidth: 180 }} onClick={(e) => e.stopPropagation()}>
            <Select value={selectedExecutionId ?? ''} onValueChange={(next) => { if (next != null) ((v) => onSelectExecution?.(v || null))(next); }} items={historyOptions}><SelectTrigger className="w-fit" aria-label={t('canvas.exec_current_run')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{(historyOptions).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select>
          </div>
        )}
        {collapsed ? (
          <HugeiconsIcon icon={ChevronUpIcon} className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div
          className="overflow-y-auto px-4 py-2 flex flex-col gap-1 font-mono"
          style={{ maxHeight: 180, background: 'var(--background)' }}
        >
          {displayEntries.length === 0 && (
            <p className="text-xs italic text-muted-foreground">
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
