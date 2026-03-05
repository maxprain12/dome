'use client';

import { useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Terminal, Loader2, CheckCircle2, Copy, Check, Save } from 'lucide-react';
import type { OutputNodeData } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { generateId } from '@/lib/utils';

export default function OutputNode({ data, selected }: NodeProps<OutputNodeData>) {
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
      showToast('error', 'No se pudo copiar al portapapeles');
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
        type: 'note',
        title: data.label ?? 'Resultado del Workflow',
        content: data.content,
        created_at: now,
        updated_at: now,
      });
      showToast('success', 'Guardado en la biblioteca');
    } catch {
      showToast('error', 'No se pudo guardar el recurso');
    } finally {
      setSaving(false);
    }
  }, [data.content, data.label, saving, currentProject?.id]);

  return (
    <div
      className="rounded-xl shadow-sm transition-all"
      style={{
        width: 320,
        background: 'var(--dome-surface)',
        border: `1.5px solid ${
          selected
            ? 'var(--dome-accent)'
            : isDone
            ? 'var(--dome-accent)'
            : 'var(--dome-border)'
        }`,
        boxShadow: isDone
          ? '0 0 0 3px var(--dome-accent-bg), 0 2px 8px rgba(0,0,0,0.06)'
          : selected
          ? '0 0 0 3px var(--dome-accent-bg)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: 'var(--dome-accent)',
          border: '2px solid white',
          boxShadow: '0 0 0 1px var(--dome-accent)',
        }}
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: isDone ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
          borderBottom: `1px solid ${isDone ? 'var(--border)' : 'var(--dome-border)'}`,
          borderRadius: '10px 10px 0 0',
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: isDone ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
        >
          <Terminal className="w-3.5 h-3.5 text-white" />
        </div>
        <span
          className="flex-1 text-xs font-semibold"
          style={{ color: isDone ? 'var(--dome-accent)' : 'var(--dome-text-secondary)' }}
        >
          {data.label}
        </span>
        {isRunning && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--dome-accent)' }} />}
        {isDone && (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="nodrag p-1 rounded-md transition-colors hover:bg-[var(--dome-accent-bg)]"
              title="Copiar al portapapeles"
            >
              {copied ? (
                <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
              ) : (
                <Copy className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
              )}
            </button>
            {/* Save as resource button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="nodrag p-1 rounded-md transition-colors hover:bg-[var(--dome-accent-bg)] disabled:opacity-50"
              title="Guardar como nota en la biblioteca"
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
      <div className="p-3" style={{ minHeight: 80 }}>
        {!data.content ? (
          <div
            className="flex flex-col items-center justify-center py-4 gap-2"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <Terminal className="w-6 h-6 opacity-20" />
            <p className="text-xs italic">El resultado aparecerá aquí</p>
          </div>
        ) : (
          <div
            className="nowheel text-xs leading-relaxed overflow-y-auto"
            style={{
              color: 'var(--dome-text)',
              maxHeight: 280,
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
