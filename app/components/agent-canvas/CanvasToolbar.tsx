'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  PlayIcon as PlayIcon,
  SquareIcon as SquareIcon,
  SaveIcon as SaveIcon,
  Delete02Icon as Trash2Icon,
  Loading03Icon as Loader2Icon,
  CheckmarkCircle02Icon as CheckCircle2Icon,
  AlertCircleIcon as AlertCircleIcon,
  PencilIcon as PencilIcon,
  ChevronLeftIcon as ChevronLeftIcon,
  GitBranchIcon as GitBranchIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface CanvasToolbarProps {
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onClear: () => void;
  onBackToLibrary: () => void;
  onRename: () => void;
}

export default function CanvasToolbar({
  onRun,
  onStop,
  onSave,
  onClear,
  onBackToLibrary,
  onRename,
}: CanvasToolbarProps) {
  const { t } = useTranslation();
  const { executionStatus, activeWorkflowName, isDirty, nodes } = useCanvasStore((s) => ({
    executionStatus: s.executionStatus,
    activeWorkflowName: s.activeWorkflowName,
    isDirty: s.isDirty,
    nodes: s.nodes,
  }));

  const isRunning = executionStatus === 'running';

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
      {/* Identity group */}
      <Button type="button" variant="ghost" onClick={onBackToLibrary} title={t('canvas.back_to_library')} aria-label={t('canvas.back_to_library')} size="icon-sm">
        <HugeiconsIcon icon={ChevronLeftIcon} data-icon="inline-start" />
      </Button>

      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
        aria-hidden
      >
        <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" strokeWidth={1.75} />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRename}
        className="max-w-[min(240px,40vw)]"
        title={t('canvas.rename_workflow')}
      >
        <span className="truncate">{activeWorkflowName}</span>
        <HugeiconsIcon icon={PencilIcon} data-icon="inline-end" />
      </Button>

      {/* Save-state chip */}
      <Badge variant={isDirty ? 'outline' : 'secondary'}>
        {isDirty ? t('canvas.unsaved_changes') : t('canvas.all_saved')}
      </Badge>

      <span className="hidden shrink-0 text-[11px] tabular-nums sm:inline text-muted-foreground">
        {t('orchestration.workflows.nodes_count', { count: nodes.length })}
      </span>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Execution group */}
      {isRunning ? (
        <Button type="button" variant="secondary" onClick={onStop} className="text-destructive" size="sm"><HugeiconsIcon icon={SquareIcon} data-icon="inline-start" />
          {t('canvas.stop')}
        </Button>
      ) : (
        <Button type="button" onClick={onRun} size="sm"><HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          {t('canvas.run')}
        </Button>
      )}

      {executionStatus === 'running' && (
        <span className="flex items-center gap-1.5 text-xs text-primary">
          <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
          {t('canvas.running_workflow')}
        </span>
      )}
      {executionStatus === 'done' && (
        <span className="flex items-center gap-1.5 text-xs text-[var(--success)]">
          <HugeiconsIcon icon={CheckCircle2Icon} className="size-3.5" />
          {t('canvas.completed')}
        </span>
      )}
      {executionStatus === 'error' && (
        <span className="flex items-center gap-1.5 text-xs text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
          {t('canvas.execution_error')}
        </span>
      )}

      <div className="min-w-2 flex-1" />

      {/* Persistence group */}
      <Button type="button" variant={isDirty ? 'outline' : 'ghost'} onClick={onSave} title={t('canvas.save_workflow')} size="sm"><HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />
        {t('canvas.save')}
      </Button>

      <Button type="button" variant="ghost" onClick={onClear} title={t('canvas.clear_canvas')} className="text-muted-foreground hover:text-destructive" size="sm"><HugeiconsIcon icon={Trash2Icon} data-icon="inline-start" />
        {t('canvas.clear_canvas')}
      </Button>
    </div>
  );
}
