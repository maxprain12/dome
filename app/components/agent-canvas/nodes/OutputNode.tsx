'use client';

import { useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Terminal, Loader2, CheckCircle2, Copy, Check, Save } from 'lucide-react';
import type { OutputNodeData } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { generateId } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function OutputNode({ data, selected }: NodeProps<OutputNodeData>) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentProject = useAppStore((s) => s.currentProject);
  const isRunning = data.status === 'running';
  const isDone = data.status === 'done';

  const handleCopy = useCallback(async () => {
    if (!data.content) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', t('toast.clipboard_copy_error'));
    }
  }, [data.content]);

  const handleSave = useCallback(async () => {
    if (!data.content || saving) return;
    setSaving(true);
    try {
      const projectId = currentProject?.id ?? 'default';
      const now = Date.now();
      await window.electron?.invoke('db:resources:create', {
        id: generateId(),
        project_id: projectId,
        type: 'url',
        title: data.label ?? t('canvas.workflow_result_note_title'),
        content: data.content,
        created_at: now,
        updated_at: now,
      });
      showToast('success', t('toast.saved_to_library'));
    } catch {
      showToast('error', t('toast.resource_save_error'));
    } finally {
      setSaving(false);
    }
  }, [data.content, data.label, saving, currentProject?.id, t]);

  return (
    <div
      className="workflow-node-card rounded-lg overflow-hidden transition-colors"
      style={{
        width: 260,
        border: `1px solid ${selected ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="workflow-node-handle"
        style={{ background: 'var(--dome-accent)' }}
      />

      <div className="workflow-node-header flex items-center gap-1.5 px-2 py-1.5">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: isDone ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
        >
          <Terminal className="w-3 h-3 text-white" />
        </div>
        <span
          className="flex-1 text-[11px] font-semibold leading-tight truncate"
          style={{ color: isDone ? 'var(--dome-accent)' : 'var(--dome-text)' }}
        >
          {data.label}
        </span>
        {isRunning && <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: 'var(--dome-accent)' }} />}
        {isDone && (
          <div className="flex items-center gap-0.5 shrink-0">
            <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
            <button
              onClick={handleCopy}
              className="nodrag p-0.5 rounded transition-colors hover:bg-[var(--dome-accent-bg)]"
              title={t('canvas.copy_to_clipboard')}
            >
              {copied ? (
                <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
              ) : (
                <Copy className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="nodrag p-0.5 rounded transition-colors hover:bg-[var(--dome-accent-bg)] disabled:opacity-50"
              title={t('canvas.save_as_note')}
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--dome-accent)' }} />
              ) : (
                <Save className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-2" style={{ minHeight: 52 }}>
        {!data.content ? (
          <div
            className="flex flex-col items-center justify-center py-2 gap-1"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <Terminal className="w-4 h-4 opacity-25" />
            <p className="text-[10px] italic text-center px-1 leading-snug">{t('canvas.output_placeholder')}</p>
          </div>
        ) : (
          <div
            className="nowheel text-[11px] leading-snug overflow-y-auto"
            style={{
              color: 'var(--dome-text)',
              maxHeight: 220,
            }}
          >
            <MarkdownPreview content={data.content} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Lightweight markdown renderer for the node canvas. Avoids heavy import of MarkdownRenderer. */
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="font-bold text-xs mb-1 mt-2" style={{ color: 'var(--dome-text)' }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="font-bold text-xs mb-1 mt-2" style={{ color: 'var(--dome-text)' }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="font-bold text-xs mb-1 mt-2" style={{ color: 'var(--dome-text)' }}>
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-1.5 mb-0.5">
          <span style={{ color: 'var(--dome-accent)' }}>•</span>
          <span style={{ color: 'var(--dome-text-secondary)' }}>{formatInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      elements.push(
        <pre
          key={i}
          className="text-xs p-2 rounded-lg overflow-x-auto mb-1"
          style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', fontFamily: 'monospace' }}
        >
          {codeLines.join('\n')}
        </pre>
      );
    } else {
      elements.push(
        <p key={i} className="mb-0.5 leading-relaxed" style={{ color: 'var(--dome-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {formatInline(line)}
        </p>
      );
    }

    i++;
  }

  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((rawPart, i) => {
    const part = rawPart ?? '';
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded text-xs"
          style={{ background: 'var(--dome-bg)', fontFamily: 'monospace' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
