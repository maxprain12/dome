'use client';

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
  const { executionStatus, activeWorkflowName, isDirty } = useCanvasStore((s) => ({
    executionStatus: s.executionStatus,
    activeWorkflowName: s.activeWorkflowName,
    isDirty: s.isDirty,
  }));

  const isRunning = executionStatus === 'running';

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 shrink-0"
      style={{
        background: 'var(--dome-surface)',
        borderBottom: '1px solid var(--dome-border)',
        zIndex: 10,
      }}
    >
      {/* Workflow name */}
      <button
        onClick={onRename}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--dome-accent-bg)] max-w-[200px] truncate"
        style={{ color: 'var(--dome-text)' }}
        title="Renombrar workflow"
      >
        <span className="truncate">{activeWorkflowName}</span>
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--dome-accent)] shrink-0" />}
        <Pencil className="w-3 h-3 shrink-0 opacity-40" />
      </button>

      <div className="w-px h-5 mx-1" style={{ background: 'var(--dome-border)' }} />

      {/* Run / Stop */}
      {isRunning ? (
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'var(--error-bg)',
            color: 'var(--error)',
            border: '1px solid var(--error-bg)',
          }}
        >
          <Square className="w-3.5 h-3.5" />
          Detener
        </button>
      ) : (
        <button
          onClick={onRun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
          style={{
            background: 'var(--dome-accent)',
            color: 'white',
            boxShadow: '0 1px 4px rgba(89, 96, 55, 0.3)',
          }}
        >
          <Play className="w-3.5 h-3.5" />
          Ejecutar
        </button>
      )}

      {/* Status indicator */}
      {executionStatus === 'running' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--dome-accent)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Ejecutando workflow...</span>
        </div>
      )}
      {executionStatus === 'done' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Completado</span>
        </div>
      )}
      {executionStatus === 'error' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--error)' }}>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Error en ejecución</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Volver a biblioteca */}
      <button
        onClick={onBackToLibrary}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
        style={{
          background: 'var(--dome-bg)',
          color: 'var(--dome-text-secondary)',
          border: '1px solid var(--dome-border)',
        }}
        title="Volver a biblioteca de workflows"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Biblioteca</span>
      </button>

      {/* Save */}
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
        style={{
          background: 'var(--dome-bg)',
          color: isDirty ? 'var(--dome-accent)' : 'var(--dome-text-secondary)',
          border: `1px solid ${isDirty ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        }}
        title="Guardar workflow"
      >
        <Save className="w-3.5 h-3.5" />
        <span>Guardar</span>
      </button>

      {/* Clear */}
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
        style={{
          background: 'var(--dome-bg)',
          color: 'var(--dome-text-muted)',
          border: '1px solid var(--dome-border)',
        }}
        title="Limpiar canvas"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Limpiar</span>
      </button>
    </div>
  );
}
