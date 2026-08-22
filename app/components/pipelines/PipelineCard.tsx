import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, type DragEvent as ReactDragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BotIcon,
  Calendar03Icon,
  CheckIcon,
  CheckmarkSquare02Icon,
  Comment01Icon,
  GripVerticalIcon,
  Loading03Icon,
  PlayIcon,
  UserIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import type { AssignedKind, PipelineItem, PipelineStage, ExecStatus } from '@/lib/pipelines/types';
import { PIPELINE_ITEM_DRAG_TYPE } from '@/lib/pipelines/types';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<ExecStatus, 'outline' | 'mint' | 'lime' | 'destructive' | 'secondary'> = {
  pending: 'outline',
  running: 'mint',
  ready: 'lime',
  failed: 'destructive',
  blocked: 'secondary',
};

const ASSIGNED_ICONS = {
  agent: BotIcon,
  auto: ZapIcon,
  manual: UserIcon,
} as const;

function formatDate(ms?: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Flatten markdown into a clean single-line snippet for the compact card
 * preview (strips headings, emphasis, tables, lists, code and links).
 */
function toPreviewText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[-:]{3,}/g, ' ')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Icon for assigned kind — extracted so PipelineCard stays under S3776. */
function assignedIconFor(kind: AssignedKind) {
  switch (kind) {
    case 'agent':
    case 'auto':
    case 'manual':
      return ASSIGNED_ICONS[kind];
    case 'unassigned':
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Todo progress from item payload — extracted for S3776. */
function todoCounts(data: Record<string, unknown> | null | undefined): { done: number; total: number } {
  if (!Array.isArray(data?.todos)) return { done: 0, total: 0 };
  const todos = data.todos as Array<{ done?: boolean }>;
  return { done: todos.filter((td) => td?.done).length, total: todos.length };
}

/** Compact data.text preview — extracted for S3776. */
function dataPreviewText(data: Record<string, unknown> | null | undefined): string | null {
  if (typeof data?.text !== 'string') return null;
  if (data.text.trim().length === 0) return null;
  return toPreviewText(data.text);
}

/** Last-output snippet when run finished — extracted for S3776. */
function lastOutputSnippetFor(item: PipelineItem, isRunning: boolean): string | null {
  if (isRunning) return null;
  if (item.execStatus !== 'failed' && item.execStatus !== 'ready') return null;
  if (typeof item.lastOutput !== 'string') return null;
  if (item.lastOutput.trim().length === 0) return null;
  return toPreviewText(item.lastOutput).slice(0, 80);
}

function stageAllowsRun(stage: PipelineStage | undefined, isRunning: boolean): boolean {
  return stage?.executionPolicy === 'manual_agent' && !isRunning;
}

function stageAllowsResolve(stage: PipelineStage | undefined, execStatus: ExecStatus): boolean {
  return stage?.executionPolicy === 'manual_resolve' && execStatus !== 'ready';
}

/** Title + todo badge + spinner — extracted for S3776. */
function PipelineCardTitleRow({
  title,
  todoDone,
  todoTotal,
  isRunning,
}: {
  title: string;
  todoDone: number;
  todoTotal: number;
  isRunning: boolean;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <HugeiconsIcon
        icon={GripVerticalIcon}
        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{title}</span>
      {todoTotal > 0 ? (
        <Badge variant="outline" className="shrink-0 gap-0.5 tabular-nums">
          <HugeiconsIcon icon={CheckmarkSquare02Icon} className="size-3" />
          {todoDone}/{todoTotal}
        </Badge>
      ) : null}
      {isRunning ? (
        <HugeiconsIcon
          icon={Loading03Icon}
          className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

type Translate = (key: string) => string;

/** Status / assignee / due meta — extracted for S3776. */
function PipelineCardMetaRow({
  displayStatus,
  assignedIcon,
  agentName,
  assignedKind,
  due,
  t,
}: {
  displayStatus: ExecStatus;
  assignedIcon: (typeof ASSIGNED_ICONS)[keyof typeof ASSIGNED_ICONS] | null;
  agentName?: string;
  assignedKind: AssignedKind;
  due: string | null;
  t: Translate;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
      <Badge variant={STATUS_BADGE[displayStatus]} className="font-normal">
        {t(`pipelines.status_${displayStatus}`)}
      </Badge>
      {assignedIcon ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <HugeiconsIcon icon={assignedIcon} className="size-3" />
          <span className="max-w-[7rem] truncate">
            {agentName ?? t(`pipelines.assigned_${assignedKind}`)}
          </span>
        </span>
      ) : null}
      {due ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <HugeiconsIcon icon={Calendar03Icon} className="size-2.5" />
          {due}
        </span>
      ) : null}
    </div>
  );
}

/** Data + last-output previews — extracted for S3776. */
function PipelineCardSnippets({
  dataText,
  lastOutputSnippet,
  lastOutput,
}: {
  dataText: string | null;
  lastOutputSnippet: string | null;
  lastOutput?: string | null;
}) {
  if (!dataText && !lastOutputSnippet) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1 pl-4">
      {dataText ? (
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={dataText}>
          {dataText}
        </span>
      ) : null}
      {lastOutputSnippet ? (
        <span
          className="inline-flex items-center gap-1 truncate text-[11px] leading-snug text-muted-foreground"
          title={lastOutput ?? undefined}
        >
          <HugeiconsIcon icon={Comment01Icon} className="size-2.5 shrink-0" aria-hidden />
          {lastOutputSnippet}
        </span>
      ) : null}
    </div>
  );
}

/** Run / resolve actions — extracted for S3776. */
function PipelineCardActions({
  canRun,
  canResolve,
  onRun,
  onResolve,
  t,
}: {
  canRun: boolean;
  canResolve: boolean;
  onRun: () => void;
  onResolve: () => void;
  t: Translate;
}) {
  if (!canRun && !canResolve) return null;
  return (
    <div className="mt-2 flex items-center justify-end gap-1">
      {canRun ? (
        <Button
          type="button"
          size="xs"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
        >
          <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          {t('pipelines.run_now')}
        </Button>
      ) : null}
      {canResolve ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onResolve();
          }}
        >
          <HugeiconsIcon icon={CheckIcon} data-icon="inline-start" />
          {t('pipelines.resolve')}
        </Button>
      ) : null}
    </div>
  );
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

  const due = formatDate(item.endAt) ?? formatDate(item.startAt);
  const canRun = stageAllowsRun(stage, isRunning);
  const canResolve = stageAllowsResolve(stage, item.execStatus);
  const assignedIcon = assignedIconFor(item.assignedKind);
  const { done: todoDone, total: todoTotal } = todoCounts(item.data);
  const dataText = dataPreviewText(item.data);
  const lastOutputSnippet = lastOutputSnippetFor(item, isRunning);

  const onKeyActivate = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      onKeyDown={onKeyActivate}
      aria-grabbed={dragging}
      className={cn(
        'group w-full cursor-grab rounded-xl border bg-card p-2.5 text-left shadow-none',
        'transition-[border-color,opacity,background-color] [transition-duration:var(--duration-fast)]',
        'hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isRunning && 'border-primary',
        dragging && 'opacity-50',
        'active:cursor-grabbing',
      )}
    >
      <PipelineCardTitleRow
        title={item.title}
        todoDone={todoDone}
        todoTotal={todoTotal}
        isRunning={isRunning}
      />
      <PipelineCardMetaRow
        displayStatus={displayStatus}
        assignedIcon={assignedIcon}
        agentName={agentName}
        assignedKind={item.assignedKind}
        due={due}
        t={t}
      />
      <PipelineCardSnippets
        dataText={dataText}
        lastOutputSnippet={lastOutputSnippet}
        lastOutput={item.lastOutput}
      />
      <PipelineCardActions
        canRun={canRun}
        canResolve={canResolve}
        onRun={onRun}
        onResolve={onResolve}
        t={t}
      />
    </div>
  );
}
