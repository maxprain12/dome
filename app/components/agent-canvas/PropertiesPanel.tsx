'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, Bot, Type, FileText, Image, Terminal } from 'lucide-react';
import type { Node } from 'reactflow';
import type { CanvasNodeData, AgentNodeData, TextInputNodeData, DocumentNodeData, ImageNodeData, OutputNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';

interface PropertiesPanelProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const TYPE_ICONS = {
  'text-input': Type,
  document: FileText,
  image: Image,
  agent: Bot,
  output: Terminal,
} as const;

const TYPE_COLORS = {
  'text-input': 'var(--dome-accent)',
  document: 'var(--success)',
  image: 'var(--warning)',
  agent: 'var(--dome-accent)',
  output: 'var(--dome-accent)',
} as const;

const fieldLabelClass = 'block text-[11px] font-medium mb-1.5';
const fieldLabelStyle = { color: 'var(--dome-text-muted)' } as const;
const inputClass =
  'w-full px-3 py-2 rounded-lg text-xs outline-none transition-all focus:ring-1 focus:ring-[var(--dome-accent)]';

export default function PropertiesPanel({ node, onClose, onDelete }: PropertiesPanelProps) {
  const { t } = useTranslation();
  const updateNode = useCanvasStore((s) => s.updateNode);

  const meta = useMemo(() => {
    const ty = node.data.type;
    const Icon = TYPE_ICONS[ty] ?? Terminal;
    let label: string;
    switch (ty) {
      case 'text-input':
        label = t('canvas.input_text_label');
        break;
      case 'document':
        label = t('canvas.input_document_label');
        break;
      case 'image':
        label = t('canvas.input_image_label');
        break;
      case 'agent':
        label = t('canvas.prop_agent');
        break;
      default:
        label = t('canvas.output_result_label');
    }
    return { Icon, label, color: TYPE_COLORS[ty] ?? 'var(--dome-accent)' };
  }, [node.data.type, t]);

  const agentStatusLabel = (status: AgentNodeData['status']) => {
    switch (status) {
      case 'idle':
        return t('canvas.status_idle');
      case 'running':
        return t('canvas.status_running');
      case 'done':
        return t('canvas.status_done');
      case 'error':
        return t('canvas.status_error');
      default:
        return status;
    }
  };

  const sectionGap = 'space-y-5';

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 280,
        background: 'var(--dome-surface)',
        borderLeft: '1px solid var(--dome-border)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: meta.color }}
        >
          <meta.Icon className="w-4 h-4 text-white" />
        </div>
        <span className="flex-1 text-sm font-semibold leading-tight" style={{ color: 'var(--dome-text)' }}>
          {meta.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)] transition-colors shrink-0"
        >
          <X className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto px-4 py-5 ${sectionGap}`}>
        <div>
          <label className={fieldLabelClass} style={fieldLabelStyle}>
            {t('canvas.prop_label')}
          </label>
          <input
            type="text"
            value={node.data.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value } as Partial<CanvasNodeData>)}
            className={inputClass}
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text)',
              border: '1px solid var(--dome-border)',
            }}
          />
        </div>

        {node.data.type === 'text-input' && (
          <div>
            <label className={fieldLabelClass} style={fieldLabelStyle}>
              {t('canvas.prop_value')}
            </label>
            <textarea
              value={(node.data as TextInputNodeData).value}
              onChange={(e) =>
                updateNode(node.id, { value: e.target.value } as Partial<TextInputNodeData>)
              }
              rows={5}
              className={`${inputClass} resize-none`}
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
              }}
            />
          </div>
        )}

        {node.data.type === 'document' && (
          <div className="space-y-4">
            <div>
              <label className={fieldLabelClass} style={fieldLabelStyle}>
                {t('canvas.prop_resource')}
              </label>
              {(node.data as DocumentNodeData).resourceTitle ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                    {(node.data as DocumentNodeData).resourceTitle}
                  </span>
                  {(node.data as DocumentNodeData).resourceType && (
                    <span
                      title={t('canvas.prop_resource_type')}
                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md font-medium"
                      style={{
                        background: 'var(--dome-bg)',
                        color: 'var(--dome-text-muted)',
                        border: '1px solid var(--dome-border)',
                      }}
                    >
                      {(node.data as DocumentNodeData).resourceType}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('canvas.prop_no_resource')}
                </p>
              )}
            </div>
            {(node.data as DocumentNodeData).resourceContent && (
              <div>
                <label className={fieldLabelClass} style={fieldLabelStyle}>
                  {t('canvas.prop_content_preview')}
                </label>
                <pre
                  className="text-[11px] leading-relaxed rounded-lg p-3 max-h-52 overflow-auto font-mono whitespace-pre-wrap break-words"
                  style={{
                    background: 'var(--dome-bg)',
                    color: 'var(--dome-text-secondary)',
                    border: '1px solid var(--dome-border)',
                  }}
                >
                  {(node.data as DocumentNodeData).resourceContent}
                </pre>
              </div>
            )}
          </div>
        )}

        {node.data.type === 'image' && (
          <div>
            <label className={fieldLabelClass} style={fieldLabelStyle}>
              {t('canvas.prop_image')}
            </label>
            {(node.data as ImageNodeData).resourceUrl ? (
              <img
                src={(node.data as ImageNodeData).resourceUrl!}
                alt={(node.data as ImageNodeData).resourceTitle ?? ''}
                className="w-full rounded-lg object-cover"
                style={{ maxHeight: 140, border: '1px solid var(--dome-border)' }}
              />
            ) : (
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.prop_no_image')}
              </p>
            )}
          </div>
        )}

        {node.data.type === 'agent' && (
          <div className="space-y-4">
            <div>
              <label className={fieldLabelClass} style={fieldLabelStyle}>
                {t('canvas.prop_agent')}
              </label>
              <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                {(node.data as AgentNodeData).agentName ?? t('canvas.prop_unassigned')}
              </p>
            </div>
            <div>
              <label className={fieldLabelClass} style={fieldLabelStyle}>
                {t('canvas.prop_status')}
              </label>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full"
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
                {agentStatusLabel((node.data as AgentNodeData).status)}
              </span>
            </div>
            {(node.data as AgentNodeData).outputText && (
              <div>
                <label className={fieldLabelClass} style={fieldLabelStyle}>
                  {t('canvas.prop_output')}
                </label>
                <pre
                  className="text-[11px] rounded-lg p-3 max-h-40 overflow-auto font-mono whitespace-pre-wrap break-words"
                  style={{
                    background: 'var(--dome-bg)',
                    color: 'var(--dome-text-secondary)',
                    border: '1px solid var(--dome-border)',
                  }}
                >
                  {(node.data as AgentNodeData).outputText}
                </pre>
              </div>
            )}
          </div>
        )}

        {node.data.type === 'output' && (node.data as OutputNodeData).content && (
          <div>
            <label className={fieldLabelClass} style={fieldLabelStyle}>
              {t('canvas.prop_content')}
            </label>
            <pre
              className="text-[11px] font-mono leading-relaxed rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
              }}
            >
              {(node.data as OutputNodeData).content}
            </pre>
          </div>
        )}
      </div>

      <div className="p-4 shrink-0" style={{ borderTop: '1px solid var(--dome-border)' }}>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors border border-[var(--dome-border)] bg-transparent hover:bg-[var(--error-bg)]"
          style={{ color: 'var(--error)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('canvas.prop_delete_node')}
        </button>
      </div>
    </div>
  );
}
