'use client';

import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  ChevronLeft,
  GitBranch,
} from 'lucide-react';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import DomeButton from '@/components/ui/DomeButton';

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
    <div
      className="flex shrink-0 items-center gap-2 px-3 py-2"
      style={{ background: 'var(--dome-surface)', borderBottom: '1px solid var(--dome-border)', zIndex: 10 }}
    >
      {/* Identity group */}
      <DomeButton
        type="button"
        variant="ghost"
        size="sm"
        iconOnly
        onClick={onBackToLibrary}
        title={t('canvas.back_to_library')}
        aria-label={t('canvas.back_to_library')}
      >
        <ChevronLeft className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
      </DomeButton>

      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
        aria-hidden
      >
        <GitBranch className="size-3.5" strokeWidth={1.75} />
      </div>

      <button
        type="button"
        onClick={onRename}
        className="flex max-w-[min(240px,40vw)] items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--dome-bg)]"
        style={{ color: 'var(--dome-text)' }}
        title={t('canvas.rename_workflow')}
      >
        <span className="truncate">{activeWorkflowName}</span>
        <Pencil className="size-3 shrink-0 opacity-40" />
      </button>

      {/* Save-state chip */}
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{
          background: isDirty ? 'var(--warning-bg)' : 'var(--dome-bg-hover)',
          color: isDirty ? 'var(--warning)' : 'var(--dome-text-muted)',
          border: '1px solid var(--dome-border)',
        }}
      >
        {isDirty ? t('canvas.unsaved_changes') : t('canvas.all_saved')}
      </span>

      <span className="hidden shrink-0 text-[11px] tabular-nums sm:inline" style={{ color: 'var(--dome-text-muted)' }}>
        {t('orchestration.workflows.nodes_count', { count: nodes.length })}
      </span>

      <div className="mx-1 h-5 w-px shrink-0" style={{ background: 'var(--dome-border)' }} />

      {/* Execution group */}
      {isRunning ? (
        <DomeButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={onStop}
          className="!text-[var(--error)]"
          leftIcon={<Square className="size-3.5" />}
        >
          {t('canvas.stop')}
        </DomeButton>
      ) : (
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onRun}
          className="!bg-[var(--dome-accent)]"
          leftIcon={<Play className="size-3.5" />}
        >
          {t('canvas.run')}
        </DomeButton>
      )}

      {executionStatus === 'running' && (
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--dome-accent)' }}>
          <Loader2 className="size-3.5 animate-spin" />
          {t('canvas.running_workflow')}
        </span>
      )}
      {executionStatus === 'done' && (
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <CheckCircle2 className="size-3.5" />
          {t('canvas.completed')}
        </span>
      )}
      {executionStatus === 'error' && (
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--error)' }}>
          <AlertCircle className="size-3.5" />
          {t('canvas.execution_error')}
        </span>
      )}

      <div className="min-w-2 flex-1" />

      {/* Persistence group */}
      <DomeButton
        type="button"
        variant={isDirty ? 'outline' : 'ghost'}
        size="sm"
        onClick={onSave}
        className={isDirty ? '!border-[var(--dome-accent)] !text-[var(--dome-accent)]' : ''}
        title={t('canvas.save_workflow')}
        leftIcon={<Save className="size-3.5" />}
      >
        {t('canvas.save')}
      </DomeButton>

      <DomeButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        title={t('canvas.clear_canvas')}
        className="!text-[var(--dome-text-muted)] hover:!text-[var(--error)]"
        leftIcon={<Trash2 className="size-3.5" />}
      >
        {t('canvas.clear_canvas')}
      </DomeButton>
    </div>
  );
}
