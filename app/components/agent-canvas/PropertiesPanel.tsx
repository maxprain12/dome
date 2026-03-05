'use client';

import { X, Trash2, Bot, Type, FileText, Image, Terminal } from 'lucide-react';
import type { Node } from 'reactflow';
import type { CanvasNodeData, AgentNodeData, TextInputNodeData, DocumentNodeData, ImageNodeData, OutputNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface PropertiesPanelProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const TYPE_META = {
  'text-input': { label: 'Texto de Entrada', color: 'var(--dome-accent)', Icon: Type },
  document: { label: 'Documento', color: 'var(--success)', Icon: FileText },
  image: { label: 'Imagen', color: 'var(--warning)', Icon: Image },
  agent: { label: 'Agente', color: 'var(--dome-accent)', Icon: Bot },
  output: { label: 'Resultado', color: 'var(--dome-accent)', Icon: Terminal },
};

export default function PropertiesPanel({ node, onClose, onDelete }: PropertiesPanelProps) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const meta = TYPE_META[node.data.type] ?? TYPE_META['output'];

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 240,
        background: 'var(--dome-surface)',
        borderLeft: '1px solid var(--dome-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: meta.color }}
        >
          <meta.Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
          {meta.label}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--dome-accent-bg)] transition-colors"
        >
          <X className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label field — common to all */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-secondary)' }}>
            Etiqueta
          </label>
          <input
            type="text"
            value={node.data.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value } as Partial<CanvasNodeData>)}
            className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-all"
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text)',
              border: '1px solid var(--dome-border)',
            }}
          />
        </div>

        {/* Type-specific fields */}
        {node.data.type === 'text-input' && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-secondary)' }}>
              Valor
            </label>
            <textarea
              value={(node.data as TextInputNodeData).value}
              onChange={(e) =>
                updateNode(node.id, { value: e.target.value } as Partial<TextInputNodeData>)
              }
              rows={5}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none transition-all"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
              }}
            />
          </div>
        )}

        {node.data.type === 'document' && (
          <div className="space-y-2">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-secondary)' }}>
              Recurso
            </label>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {(node.data as DocumentNodeData).resourceTitle ?? 'Sin recurso seleccionado'}
            </p>
            {(node.data as DocumentNodeData).resourceContent && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-secondary)' }}>
                  Contenido (preview)
                </label>
                <p
                  className="text-xs rounded-lg p-2 line-clamp-4"
                  style={{
                    background: 'var(--dome-bg)',
                    color: 'var(--dome-text-muted)',
                    border: '1px solid var(--dome-border)',
                  }}
                >
                  {(node.data as DocumentNodeData).resourceContent}
                </p>
              </div>
            )}
          </div>
        )}

        {node.data.type === 'image' && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--dome-text-secondary)' }}>
              Imagen
            </label>
            {(node.data as ImageNodeData).resourceUrl ? (
              <img
                src={(node.data as ImageNodeData).resourceUrl!}
                alt={(node.data as ImageNodeData).resourceTitle ?? 'Image'}
                className="w-full rounded-lg object-cover"
                style={{ maxHeight: 120, border: '1px solid var(--dome-border)' }}
              />
            ) : (
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                Sin imagen seleccionada
              </p>
            )}
          </div>
        )}

        {node.data.type === 'agent' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-secondary)' }}>
                Agente
              </label>
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                {(node.data as AgentNodeData).agentName ?? 'Sin asignar'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-secondary)' }}>
                Estado
              </label>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full capitalize"
                style={{
                  background:
                    (node.data as AgentNodeData).status === 'done'
                      ? 'var(--success-bg)'
                      : (node.data as AgentNodeData).status === 'error'
                      ? 'var(--error-bg)'
                      : (node.data as AgentNodeData).status === 'running'
                      ? 'var(--dome-accent-bg)'
                      : 'var(--dome-bg)',
                  color:
                    (node.data as AgentNodeData).status === 'done'
                      ? 'var(--success)'
                      : (node.data as AgentNodeData).status === 'error'
                      ? 'var(--error)'
                      : (node.data as AgentNodeData).status === 'running'
                      ? 'var(--dome-accent)'
                      : 'var(--dome-text-muted)',
                }}
              >
                {(node.data as AgentNodeData).status}
              </span>
            </div>
            {(node.data as AgentNodeData).outputText && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-secondary)' }}>
                  Output
                </label>
                <p
                  className="text-xs rounded-lg p-2 line-clamp-6"
                  style={{
                    background: 'var(--dome-bg)',
                    color: 'var(--dome-text-muted)',
                    border: '1px solid var(--dome-border)',
                  }}
                >
                  {(node.data as AgentNodeData).outputText}
                </p>
              </div>
            )}
          </div>
        )}

        {node.data.type === 'output' && (node.data as OutputNodeData).content && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-secondary)' }}>
              Contenido
            </label>
            <p
              className="text-xs rounded-lg p-2 max-h-48 overflow-y-auto"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {(node.data as OutputNodeData).content}
            </p>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="p-4 shrink-0" style={{ borderTop: '1px solid var(--dome-border)' }}>
        <button
          onClick={() => onDelete(node.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
          style={{
            background: 'var(--error-bg)',
            color: 'var(--error)',
            border: '1px solid var(--error-bg)',
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Eliminar nodo
        </button>
      </div>
    </div>
  );
}
