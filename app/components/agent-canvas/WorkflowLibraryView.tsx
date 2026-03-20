'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Trash2, Clock, Plus, Workflow, Zap } from 'lucide-react';
import type { CanvasWorkflow } from '@/types/canvas';
import { getWorkflows, deleteWorkflow } from '@/lib/agent-canvas/api';
import { syncMarketplaceOnWorkflowDelete } from '@/lib/marketplace/api';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';

interface WorkflowLibraryViewProps {
  onShowAutomations?: (workflowId: string, workflowLabel: string) => void;
}

export default function WorkflowLibraryView({ onShowAutomations }: WorkflowLibraryViewProps) {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);

  const refresh = () => {
    setLoading(true);
    getWorkflows().then((wfs) => {
      setWorkflows(wfs.sort((a, b) => b.updatedAt - a.updatedAt));
      setLoading(false);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('dome:workflows-changed', handler);
    return () => window.removeEventListener('dome:workflows-changed', handler);
  }, []);

  const handleOpen = (workflow: CanvasWorkflow) => {
    loadWorkflow(workflow);
    setHomeSidebarSection(`workflow:${workflow.id}`);
  };

  const handleNew = () => {
    clearCanvas();
    setHomeSidebarSection('workflow:new');
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    const result = await deleteWorkflow(id);
    if (result.success) {
      await syncMarketplaceOnWorkflowDelete(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      showToast('success', 'Workflow eliminado');
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    } else {
      showToast('error', result.error ?? t('toast.workflow_delete_error'));
    }
    setDeletingId(null);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--dome-bg)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <Workflow className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--dome-text)' }}>
              Biblioteca de Workflows
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} guardado{workflows.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          <Plus className="w-4 h-4" />
          Nuevo workflow
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-150 motion-reduce:animate-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="resource-card-skeleton rounded-xl min-h-[120px]" aria-hidden="true" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" style={{ color: 'var(--dome-text-muted)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dome-accent-bg)' }}>
              <FolderOpen className="w-8 h-8" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <p className="text-sm font-medium">No hay workflows guardados</p>
            <p className="text-xs max-w-sm text-center">
              Crea un nuevo workflow para conectar inputs, agentes y resultados.
            </p>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--dome-accent)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              Crear primer workflow
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-150 motion-reduce:animate-none">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(wf)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(wf); }
                }}
                className="flex items-start gap-4 p-4 rounded-xl text-left transition-all hover:shadow-md group cursor-pointer"
                style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--dome-accent-bg)' }}
                >
                  <FolderOpen className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>{wf.name}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                    {wf.description || `${wf.nodes.length} nodos · ${wf.edges.length} conexiones`}
                  </p>
                  <p className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--dome-text-muted)' }}>
                    <Clock className="w-3 h-3" />
                    {formatDate(wf.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  {onShowAutomations && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onShowAutomations(wf.id, wf.name); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)] transition-colors"
                      title="Automatizaciones"
                    >
                      <Zap className="w-3.5 h-3.5" style={{ color: 'var(--dome-accent)' }} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(e, wf.id); }}
                    disabled={deletingId === wf.id}
                    className="p-1.5 rounded-lg hover:bg-[var(--error-bg)] transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
