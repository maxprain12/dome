import { memo } from 'react';
import { X } from 'lucide-react';
import { WORKFLOW_TEMPLATES } from '@/lib/canvas/workflow-templates';
import type { CanvasNode, CanvasEdge } from '@/lib/canvas/types';

interface WorkflowTemplateModalProps {
  onSelect: (template: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => void;
  onClose: () => void;
}

function WorkflowTemplateModal({ onSelect, onClose }: WorkflowTemplateModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            Plantillas de Workflow
          </h3>
          <button type="button" onClick={onClose} className="btn btn-ghost p-1.5 rounded-md">
            <X size={20} style={{ color: 'var(--dome-text-secondary)' }} />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-sm mb-4" style={{ color: 'var(--dome-text-secondary)' }}>
            Selecciona una plantilla para comenzar o crea tu propio workflow desde cero.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WORKFLOW_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="text-left p-4 rounded-xl border transition-all hover:shadow-md"
                style={{
                  background: 'var(--dome-surface)',
                  borderColor: 'var(--dome-border)',
                }}
                onClick={() =>
                  onSelect({
                    nodes: JSON.parse(JSON.stringify(template.nodes)),
                    edges: JSON.parse(JSON.stringify(template.edges)),
                  })
                }
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{template.icon}</span>
                  <div>
                    <h4 className="font-medium text-sm" style={{ color: 'var(--dome-text)' }}>
                      {template.name}
                    </h4>
                    <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                      {template.author}
                    </span>
                  </div>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-secondary)' }}>
                  {template.description}
                </p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(WorkflowTemplateModal);
