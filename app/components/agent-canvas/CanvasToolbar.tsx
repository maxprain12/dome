'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

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
    <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-muted px-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBackToLibrary}
          title={t('canvas.back_to_library')}
          aria-label={t('canvas.back_to_library')}
          size="icon-sm"
        >
          <HugeiconsIcon icon={ChevronLeftIcon} />
        </Button>

        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-mint text-primary"
          aria-hidden
        >
          <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" strokeWidth={1.75} />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRename}
          className="max-w-[min(220px,36vw)] min-w-0 px-1.5"
          title={t('canvas.rename_workflow')}
        >
          <span className="truncate font-medium">{activeWorkflowName}</span>
          <HugeiconsIcon icon={PencilIcon} data-icon="inline-end" />
        </Button>

        <Badge
          variant={isDirty ? 'outline' : 'lime'}
          className="hidden shrink-0 sm:inline-flex"
        >
          {isDirty ? t('canvas.unsaved_changes') : t('canvas.all_saved')}
        </Badge>

        <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground md:inline">
          {t('orchestration.workflows.nodes_count', { count: nodes.length })}
        </span>

        {executionStatus === 'running' ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
            <span className="hidden sm:inline">{t('canvas.running_workflow')}</span>
          </span>
        ) : null}
        {executionStatus === 'done' ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <HugeiconsIcon icon={CheckCircle2Icon} className="size-3.5" />
            <span className="hidden sm:inline">{t('canvas.completed')}</span>
          </span>
        ) : null}
        {executionStatus === 'error' ? (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
            <span className="hidden sm:inline">{t('canvas.execution_error')}</span>
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isRunning ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onStop}
            className="text-destructive"
            size="sm"
          >
            <HugeiconsIcon icon={SquareIcon} data-icon="inline-start" />
            {t('canvas.stop')}
          </Button>
        ) : (
          <Button type="button" onClick={onRun} size="sm">
            <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
            {t('canvas.run')}
          </Button>
        )}

        <Button
          type="button"
          variant={isDirty ? 'outline' : 'ghost'}
          onClick={onSave}
          title={t('canvas.save_workflow')}
          size="sm"
        >
          <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />
          <span className="hidden sm:inline">{t('canvas.save')}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          title={t('canvas.clear_canvas')}
          aria-label={t('canvas.clear_canvas')}
          className={cn('text-muted-foreground hover:text-destructive')}
        >
          <HugeiconsIcon icon={Trash2Icon} />
        </Button>
      </div>
    </div>
  );
}
