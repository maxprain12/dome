/**
 * ChatToolCard inline result highlights (03/T02 — extracted from ChatToolCard.tsx):
 * calendar/flashcard/resource success cards, codegen preview and tree summary.
 */

import { FileCode2 } from 'lucide-react';
import DomeBadge from '@/components/ui/DomeBadge';
import './tool-result-highlights.css';

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
      style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <FileCode2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
        <span
          className="text-[11.5px] font-mono truncate flex-1"
          style={{ color: 'var(--secondary-text)' }}
          title={preview.path}
        >
          {fileName || preview.path}
        </span>
        {preview.lang ? (
          <DomeBadge label={preview.lang} variant="soft" size="xs" color="var(--tertiary-text)" className="shrink-0" />
        ) : null}
      </div>
      <pre className="tool-codegen-pre">
        {preview.code}
      </pre>
      {preview.truncated ? (
        <div
          className="px-2.5 py-1 text-[11px] border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--tertiary-text)' }}
        >
          {t('chat.codegen_truncated', { defaultValue: '… vista previa truncada' })}
        </div>
      ) : null}
    </div>
  );
}
