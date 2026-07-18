import { useState, useCallback, type ReactNode } from 'react';
import { typesetDocsClass } from '@/lib/typeset';
import {
  TerminalIcon as TerminalIcon,
  Loading03Icon as Loader2Icon,
  CheckmarkCircle02Icon as CheckCircle2Icon,
  CopyIcon as CopyIcon,
  CheckIcon as CheckIcon,
  SaveIcon as SaveIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OutputNodeData } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { generateId } from '@/lib/utils';
import { stableStringHash } from '@/lib/utils/stableStringHash';
import { useTranslation } from 'react-i18next';

export default function OutputNode({
  data,
  selected,
}: {
  id: string;
  data: OutputNodeData;
  selected: boolean;
}) {
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
  }, [data.content, t]);

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
      className="wf-node-card workflow-node-card rounded-xl overflow-hidden transition-[box-shadow,border-color]"
      style={{
        width: 260,
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent)' : 'none',
        background: 'var(--card)',
      }}
    >
      <div
        className="workflow-node-header flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="size-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: isDone ? 'var(--primary)' : 'var(--muted-foreground)' }}
        >
          <HugeiconsIcon icon={TerminalIcon} className="size-3.5 text-white" />
        </div>
        <span
          className="flex-1 text-xs font-semibold leading-tight truncate"
          style={{ color: isDone ? 'var(--primary)' : 'var(--foreground)' }}
        >
          {data.label}
        </span>
        {isRunning && <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin shrink-0 text-primary" />}
        {isDone && (
          <div className="flex items-center gap-0.5 shrink-0">
            <HugeiconsIcon icon={CheckCircle2Icon} className="size-3.5 text-primary" />
            <button
              type="button"
              onClick={handleCopy}
              className="nodrag p-1 rounded-md transition-colors hover:bg-[color-mix(in srgb, var(--primary) 12%, transparent)]"
              title={t('canvas.copy_to_clipboard')}
            >
              {copied ? (
                <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-[var(--success)]" />
              ) : (
                <HugeiconsIcon icon={CopyIcon} className="size-3.5 text-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="nodrag p-1 rounded-md transition-colors hover:bg-[color-mix(in srgb, var(--primary) 12%, transparent)] disabled:opacity-50"
              title={t('canvas.save_as_note')}
            >
              {saving ? (
                <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin text-primary" />
              ) : (
                <HugeiconsIcon icon={SaveIcon} className="size-3.5 text-primary" />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="p-3" style={{ minHeight: 52 }}>
        {!data.content ? (
          <div className="flex flex-col items-center justify-center py-2 gap-1 text-muted-foreground">
            <HugeiconsIcon icon={TerminalIcon} className="size-4 opacity-25" />
            <p className="text-[10px] italic text-center px-1 leading-snug">{t('canvas.output_placeholder')}</p>
          </div>
        ) : (
          <div className={typesetDocsClass('nowheel max-h-[220px] overflow-y-auto')}>
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
  const elements: ReactNode[] = [];
  let i = 0;
  let serial = 0;
  const nextKey = (payload: string) => {
    serial += 1;
    return `canvas-md:${stableStringHash(payload)}:${serial}`;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.startsWith('### ')) {
      elements.push(<h3 key={nextKey(`h3:${line}`)}>{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={nextKey(`h2:${line}`)}>{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={nextKey(`h1:${line}`)}>{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={nextKey(`li:${line}`)} className="not-typeset flex gap-1.5">
          <span>•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>,
      );
    } else if (line.trim() === '') {
      elements.push(<div key={nextKey('blank')} className="h-1.5" />);
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      const openIdx = i;
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      const codeJoined = codeLines.join('\n');
      elements.push(
        <pre key={nextKey(`code:${line}:${openIdx}:${codeJoined.slice(0, 80)}`)}>{codeJoined}</pre>,
      );
    } else {
      elements.push(
        <p key={nextKey(`p:${line}`)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {formatInline(line)}
        </p>,
      );
    }

    i++;
  }

  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  const counts = new Map<string, number>();
  return parts.map((rawPart) => {
    const part = rawPart ?? '';
    const h = stableStringHash(part);
    const ord = (counts.get(h) ?? 0) + 1;
    counts.set(h, ord);
    const k = `inl:${h}:${ord}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={k}
          className="px-1 py-0.5 rounded text-xs"
          style={{ background: 'var(--background)', fontFamily: 'monospace' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
