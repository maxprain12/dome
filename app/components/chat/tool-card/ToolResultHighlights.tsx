/**
 * ChatToolCard inline result highlights (03/T02 — extracted from ChatToolCard.tsx):
 * calendar/flashcard/resource success cards, codegen preview and tree summary.
 */

import { HugeiconsIcon } from '@hugeicons/react';
import { FileCodeIcon } from '@hugeicons/core-free-icons';
import './tool-result-highlights.css';

import { Badge } from '@/components/ui/badge';
export function CodegenPreview({
  preview,
  t,
}: {
  preview: { path: string; code: string; lang: string; truncated: boolean };
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string;
}) {
  const fileName = preview.path ? preview.path.split('/').slice(-1)[0] : '';
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border"
      >
        <HugeiconsIcon icon={FileCodeIcon} className="shrink-0 text-[var(--success)]" aria-hidden />
        <span
          className="text-[11.5px] font-mono truncate flex-1 text-muted-foreground"
          title={preview.path}
        >
          {fileName || preview.path}
        </span>
        {preview.lang ? (
          <Badge variant="secondary" className="max-w-full font-semibold text-[10px] px-1.5 py-0.5 gap-1 h-auto shrink-0" style={{ background: 'color-mix(in srgb, var(--muted-foreground) 18%, transparent)', color: 'var(--muted-foreground)', borderColor: 'transparent' }}><span className="truncate">{preview.lang}</span></Badge>
        ) : null}
      </div>
      <pre className="tool-codegen-pre">
        {preview.code}
      </pre>
      {preview.truncated ? (
        <div
          className="px-2.5 py-1 text-[11px] border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        >
          {t('chat.codegen_truncated', { defaultValue: '… vista previa truncada' })}
        </div>
      ) : null}
    </div>
  );
}
