'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Clock, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import type { ExecutionLogEntry } from '@/lib/agent-canvas/executor';
import type { CanvasExecutionStatus } from '@/lib/store/useCanvasStore';
import type { WorkflowExecution } from '@/types/canvas';

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

function formatElapsedFromRange(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function ExecutionLog({
  entries,
  status,
  startTime,
  history = [],
  selectedExecutionId = null,
  onSelectExecution,
}: ExecutionLogProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const selectedExecution = selectedExecutionId
    ? history.find((e) => e.id === selectedExecutionId)
    : null;
  const displayEntries = status === 'running'
    ? entries
    : selectedExecution?.entries ?? entries;
  const displayStartTime = selectedExecution?.startedAt ?? startTime;
  const displayStatus = selectedExecution?.status ?? status;

  // Auto-scroll to bottom when new entries arrive (only when live)
  useEffect(() => {
    if (!collapsed && status === 'running') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, collapsed, status]);

  // Live timer while running
  useEffect(() => {
    if (status !== 'running' || !startTime) {
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [status, startTime]);

  // Reset timer on new run
  useEffect(() => {
    if (status === 'running') setElapsed(0);
  }, [status]);

  const hasContent = status === 'running' || entries.length > 0 || history.length > 0;
  if (!hasContent) return null;

  const isRunning = status === 'running';
  const isDone = displayStatus === 'done';
  const isError = displayStatus === 'error';

  const completedAgents = displayEntries.filter((e) => e.type === 'done').length;
  const totalAgents = new Set(displayEntries.map((e) => e.nodeId)).size;

  const statusColor = isRunning ? 'var(--dome-accent)' : isDone ? 'var(--success)' : isError ? 'var(--error)' : 'var(--dome-text-muted)';
  const statusLabel = isRunning ? 'Ejecutando...' : isDone ? 'Completado' : isError ? 'Error' : 'Listo';

  return (
    <div
      className="shrink-0 border-t"
      style={{
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        transition: 'height 0.2s ease',
      }}
    >
      {/* Header bar */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:opacity-80"
        style={{ background: 'var(--dome-bg)' }}
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'animate-pulse' : ''}`}
          style={{ background: statusColor }}
        />
        <span className="text-xs font-semibold" style={{ color: statusColor }}>
          {statusLabel}
        </span>
        {isRunning && (
          <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
            {formatElapsed(elapsed)}
          </span>
        )}
        {isDone && displayStartTime && !isRunning && (
          <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <Clock className="w-3 h-3 inline mr-0.5 -mt-0.5" />
            {formatElapsedFromRange(displayStartTime, selectedExecution?.finishedAt)}
          </span>
        )}
        {totalAgents > 0 && (
          <span className="ml-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            · {completedAgents}/{totalAgents} agentes
          </span>
        )}
        <div className="flex-1" />
        {history.length > 0 && onSelectExecution && (
          <select
            value={selectedExecutionId ?? ''}
            onChange={(e) => onSelectExecution(e.target.value || null)}
            className="text-xs rounded px-2 py-0.5 border-0 outline-none cursor-pointer"
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text-secondary)',
              border: '1px solid var(--dome-border)',
              maxWidth: 140,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">Ejecución actual</option>
            {history.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {new Date(ex.startedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                ({ex.status}) {ex.finishedAt ? formatElapsedFromRange(ex.startedAt, ex.finishedAt) : ''}
              </option>
            ))}
          </select>
        )}
        {collapsed ? (
          <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
        )}
      </button>

      {/* Log entries */}
      {!collapsed && (
        <div
          className="overflow-y-auto px-4 py-2 space-y-1 font-mono"
          style={{ maxHeight: 180, background: 'var(--dome-bg)' }}
        >
          {displayEntries.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--dome-text-muted)' }}>
              {status === 'running' ? 'Iniciando workflow...' : 'Sin entradas en esta ejecución'}
            </p>
          )}
          {displayEntries.map((entry) => {
            const meta = TYPE_STYLES[entry.type];
            const EntryIcon = meta.icon;
            const time = new Date(entry.timestamp).toLocaleTimeString('es', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            return (
              <div key={entry.id} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="shrink-0 tabular-nums" style={{ color: 'var(--dome-text-muted)', fontSize: 10 }}>
                  {time}
                </span>
                <EntryIcon className="w-3 h-3 shrink-0 mt-0.5" style={{ color: meta.color }} />
                <span className="font-semibold shrink-0" style={{ color: meta.color }}>
                  [{entry.nodeLabel}]
                </span>
                <span style={{ color: 'var(--dome-text-secondary)', wordBreak: 'break-all' }}>
                  {entry.message}
                </span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
