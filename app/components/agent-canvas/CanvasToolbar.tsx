'use client';

import { useTranslation } from 'react-i18next';
import { Play, Square, Save, Trash2, Loader2, CheckCircle2, AlertCircle, Pencil, ArrowLeft } from 'lucide-react';
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
  const { executionStatus, activeWorkflowName, isDirty } = useCanvasStore((s) => ({
    executionStatus: s.executionStatus,
    activeWorkflowName: s.activeWorkflowName,
    isDirty: s.isDirty,
  }));

  const isRunning = executionStatus === 'running';

  const ghostBtn =
    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors border border-transparent hover:border-[var(--dome-border)] hover:bg-[var(--dome-bg)]';
  const ghostBtnStyle = { color: 'var(--dome-text-secondary)' } as const;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 shrink-0"
      style={{
        background: 'var(--dome-surface)',
        borderBottom: '1px solid var(--dome-border)',
        zIndex: 10,
      }}
    >
      <button
        type="button"
        onClick={onRename}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-sm font-medium transition-colors max-w-[200px] truncate hover:bg-[var(--dome-bg)]"
        style={{ color: 'var(--dome-text)' }}
        title={t('canvas.rename_workflow')}
      >
        <span className="truncate">{activeWorkflowName}</span>
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--dome-accent)] shrink-0" />}
        <Pencil className="w-3 h-3 shrink-0 opacity-40" />
      </button>

      <div className="w-px h-5 mx-0.5 shrink-0" style={{ background: 'var(--dome-border)' }} />

      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
          style={{
            background: 'var(--error-bg)',
            color: 'var(--error)',
            border: '1px solid var(--dome-border)',
          }}
        >
          <Square className="w-3.5 h-3.5" />
          {t('canvas.stop')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onRun}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90 active:opacity-80"
          style={{
            background: 'var(--dome-accent)',
            color: 'var(--base-text)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <Play className="w-3.5 h-3.5" />
          {t('canvas.run')}
        </button>
      )}

      {executionStatus === 'running' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--dome-accent)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{t('canvas.running_workflow')}</span>
        </div>
      )}
      {executionStatus === 'done' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{t('canvas.completed')}</span>
        </div>
      )}
      {executionStatus === 'error' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--error)' }}>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{t('canvas.execution_error')}</span>
        </div>
      )}

      <div className="flex-1 min-w-2" />

      <button type="button" onClick={onBackToLibrary} className={ghostBtn} style={ghostBtnStyle} title={t('canvas.back_to_library')}>
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t('canvas.workflow_library')}</span>
      </button>

      <button
        type="button"
        onClick={onSave}
        className={ghostBtn}
        style={{
          color: isDirty ? 'var(--dome-accent)' : 'var(--dome-text-secondary)',
          borderColor: isDirty ? 'var(--dome-accent)' : 'transparent',
        }}
        title={t('canvas.save_workflow')}
      >
        <Save className="w-3.5 h-3.5" />
        <span>{t('canvas.save')}</span>
      </button>

      <button type="button" onClick={onClear} className={ghostBtn} style={ghostBtnStyle} title={t('canvas.clear_canvas')}>
        <Trash2 className="w-3.5 h-3.5" />
        <span>{t('canvas.clear_canvas')}</span>
      </button>
    </div>
  );
}
