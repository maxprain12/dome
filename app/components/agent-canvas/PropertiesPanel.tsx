'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cancel01Icon as XIcon,
  Delete02Icon as Trash2Icon,
  BotIcon as BotIcon,
  TextFontIcon as TypeIcon,
  File02Icon as FileTextIcon,
  Image01Icon as ImageIcon,
  TerminalIcon as TerminalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type {
  CanvasNodeData,
  AgentNodeData,
  TextInputNodeData,
  DocumentNodeData,
  ImageNodeData,
  OutputNodeData,
  WorkflowNode,
} from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const Type = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TypeIcon} {...props} />
);
const FileText = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={FileTextIcon} {...props} />
);
const Image = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ImageIcon} {...props} />
);
const Terminal = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TerminalIcon} {...props} />
);

interface PropertiesPanelProps {
  node: WorkflowNode<CanvasNodeData>;
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
  'text-input': 'var(--primary)',
  document: 'var(--success)',
  image: 'var(--warning)',
  agent: 'var(--primary)',
  output: 'var(--primary)',
} as const;

const fieldLabelClass = 'block text-[11px] font-medium mb-1.5';
const fieldLabelStyle = { color: 'var(--muted-foreground)' } as const;

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
    return { Icon, label, color: TYPE_COLORS[ty] ?? 'var(--primary)' };
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

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 280,
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="size-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: meta.color }}
        >
          <meta.Icon className="size-4 text-white" />
        </div>
        <span className="flex-1 text-sm font-semibold leading-tight text-foreground">
          {meta.label}
        </span>
        <Button
          type="button"
          onClick={onClose}
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t('ui.close')}
        >
          <HugeiconsIcon icon={XIcon} className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <FieldGroup className="flex-1 overflow-y-auto px-4 py-5">
        <Field>
          <FieldLabel>
            {t('canvas.prop_label')}
          </FieldLabel>
          <Input
            type="text"
            value={node.data.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value } as Partial<CanvasNodeData>)}
            aria-label={t('canvas.prop_label')}
          />
        </Field>

        {node.data.type === 'text-input' && (
          <Field>
            <FieldLabel>
              {t('canvas.prop_value')}
            </FieldLabel>
            <Textarea
              value={(node.data as TextInputNodeData).value}
              onChange={(e) =>
                updateNode(node.id, { value: e.target.value } as Partial<TextInputNodeData>)
              }
              aria-label={t('canvas.prop_value')}
              rows={5}
              className="resize-none"
            />
          </Field>
        )}

        {node.data.type === 'document' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={fieldLabelClass} style={fieldLabelStyle}>
                {t('canvas.prop_resource')}
              </label>
              {(node.data as DocumentNodeData).resourceTitle ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {(node.data as DocumentNodeData).resourceTitle}
                  </span>
                  {(node.data as DocumentNodeData).resourceType && (
                    <Badge
                      variant="secondary"
                      title={t('canvas.prop_resource_type')}
                      className="uppercase tracking-wide"
                    >
                      {(node.data as DocumentNodeData).resourceType}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
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
                    background: 'var(--background)',
                    color: 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
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
                style={{ maxHeight: 140, border: '1px solid var(--border)' }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('canvas.prop_no_image')}
              </p>
            )}
          </div>
        )}

        {node.data.type === 'agent' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={fieldLabelClass} style={fieldLabelStyle}>
                {t('canvas.prop_agent')}
              </label>
              <p className="text-xs font-medium text-foreground">
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
                        ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
                        : (node.data as AgentNodeData).status === 'running'
                          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                          : 'var(--background)',
                  color:
                    (node.data as AgentNodeData).status === 'done'
                      ? 'var(--success)'
                      : (node.data as AgentNodeData).status === 'error'
                        ? 'var(--destructive)'
                        : (node.data as AgentNodeData).status === 'running'
                          ? 'var(--primary)'
                          : 'var(--muted-foreground)',
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
                    background: 'var(--background)',
                    color: 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
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
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }}
            >
              {(node.data as OutputNodeData).content}
            </pre>
          </div>
        )}
      </FieldGroup>

      <div className="shrink-0 border-t p-4">
        <Button
          type="button"
          onClick={() => onDelete(node.id)}
          variant="destructive"
          className="w-full"
        >
          <HugeiconsIcon icon={Trash2Icon} data-icon="inline-start" />
          {t('canvas.prop_delete_node')}
        </Button>
      </div>
    </div>
  );
}
