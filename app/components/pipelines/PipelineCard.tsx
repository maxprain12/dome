import { useState, type DragEvent as ReactDragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, GripVertical, Play, Check, Bot, User, Zap, Loader2, CheckSquare, MessageSquare } from 'lucide-react';
import type { PipelineItem, PipelineStage, ExecStatus } from '@/lib/pipelines/types';
import { PIPELINE_ITEM_DRAG_TYPE } from '@/lib/pipelines/types';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';

const STATUS_COLOR: Record<ExecStatus, string> = {
  pending: 'var(--warning)',
  running: 'var(--accent)',
  ready: 'var(--success)',
  failed: 'var(--error)',
  blocked: 'var(--tertiary-text)',
};

function formatDate(ms?: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString();
}

/**
 * Flatten markdown into a clean single-line snippet for the compact card
 * preview (strips headings, emphasis, tables, lists, code and links). The card
 * detail panel renders full markdown; here we only want readable plain text.
 */
function toPreviewText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s{0,3}>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '') // list bullets
    .replace(/\|/g, ' ') // table pipes
    .replace(/[-:]{3,}/g, ' ') // table separators / hr
    .replace(/(\*\*|__|\*|_|~~)/g, '') // emphasis markers
    .replace(/\s+/g, ' ') // collapse whitespace/newlines
    .trim();
}

interface Props {
  item: PipelineItem;
  stage: PipelineStage | undefined;
  agentName?: string;
  onOpen: () => void;
  onRun: () => void;
  onResolve: () => void;
}

export default function PipelineCard({ item, stage, agentName, onOpen, onRun, onResolve }: Props) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const runPending = usePipelinesStore((s) => Boolean(s.runInFlightIds[item.id]));
  const isRunning = item.execStatus === 'running' || runPending;
  const displayStatus: ExecStatus = isRunning ? 'running' : item.execStatus;

  const handleDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(PIPELINE_ITEM_DRAG_TYPE, item.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  const statusColor = STATUS_COLOR[displayStatus];
  const due = formatDate(item.endAt) ?? formatDate(item.startAt);
  const canRun = stage?.executionPolicy === 'manual_agent' && !isRunning;
  const canResolve = stage?.executionPolicy === 'manual_resolve' && item.execStatus !== 'ready';

  const AssignedIcon =
    item.assignedKind === 'agent' ? Bot : item.assignedKind === 'auto' ? Zap : item.assignedKind === 'manual' ? User : null;

  const todos = Array.isArray(item.data?.todos) ? (item.data!.todos as Array<{ done?: boolean }>) : [];
  const todoTotal = todos.length;
  const todoDone = todos.filter((td) => td?.done).length;

  const dataText =
    typeof item.data?.text === 'string' && item.data.text.trim().length > 0
      ? toPreviewText(item.data.text)
      : null;

  const showLastOutput = !isRunning &&
    (item.execStatus === 'failed' || item.execStatus === 'ready') &&
    typeof item.lastOutput === 'string' && item.lastOutput.trim().length > 0;
  const lastOutputSnippet = showLastOutput ? toPreviewText(item.lastOutput!).slice(0, 80) : null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-grabbed={dragging}
      className="rounded-md p-2.5 cursor-grab active:cursor-grabbing transition-opacity"
      style={{
        background: 'var(--bg)',
        border: isRunning ? '1px solid var(--accent)' : '1px solid var(--border)',
        opacity: dragging ? 0.55 : 1,
      }}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--tertiary-text)' }} aria-hidden />
        <span className="text-sm leading-snug flex-1" style={{ color: 'var(--primary-text)' }}>
          {item.title}
        </span>
        {todoTotal > 0 && (
          <span
            className="shrink-0 mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium px-1 py-0 rounded-full"
            style={{ background: 'var(--bg-hover)', color: 'var(--secondary-text)' }}
            title={t('pipelines.todos_progress', { done: todoDone, total: todoTotal })}
          >
            <CheckSquare size={11} />
            {todoDone}/{todoTotal}
          </span>
        )}
        {isRunning ? (
          <Loader2 size={13} className="shrink-0 mt-0.5 animate-spin" style={{ color: statusColor }} aria-hidden />
        ) : (
          <span
            className="shrink-0 mt-1 rounded-full"
            style={{ width: 8, height: 8, background: statusColor }}
            aria-label={t(`pipelines.status_${displayStatus}`)}
          />
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 pl-5 flex-wrap">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--bg-hover)', color: statusColor }}
        >
          {t(`pipelines.status_${displayStatus}`)}
        </span>
        {AssignedIcon && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--secondary-text)' }}>
            <AssignedIcon size={11} />
            {agentName ?? t(`pipelines.assigned_${item.assignedKind}`)}
          </span>
        )}
        {due && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--tertiary-text)' }}>
            <Calendar size={10} />
            {due}
          </span>
        )}
      </div>

      {(dataText || lastOutputSnippet) && (
        <div className="mt-1.5 pl-5 flex flex-col gap-1">
          {dataText && (
            <span
              className="text-[11px] leading-snug truncate"
              style={{ color: 'var(--tertiary-text)' }}
              title={dataText}
            >
              {dataText}
            </span>
          )}
          {lastOutputSnippet && (
            <span
              className="text-[11px] leading-snug truncate inline-flex items-center gap-1"
              style={{ color: 'var(--tertiary-text)' }}
              title={item.lastOutput ?? undefined}
            >
              <MessageSquare size={10} className="shrink-0" aria-hidden />
              {lastOutputSnippet}
            </span>
          )}
        </div>
      )}

      {(canRun || canResolve) && (
        <div className="flex items-center justify-end gap-1 mt-2">
          {canRun && (
            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
              className="text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1"
              style={{ background: 'var(--accent)', color: 'var(--dome-on-accent)', border: 'none', cursor: 'pointer' }}
            >
              <Play size={11} />
              {t('pipelines.run_now')}
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
              className="text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1"
              style={{ background: 'transparent', color: 'var(--success)', border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <Check size={11} />
              {t('pipelines.resolve')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
