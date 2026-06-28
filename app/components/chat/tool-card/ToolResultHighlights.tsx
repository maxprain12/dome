/**
 * ChatToolCard inline result highlights (03/T02 — extracted from ChatToolCard.tsx):
 * calendar/flashcard/resource success cards, codegen preview and tree summary.
 */

import type { ReactNode } from 'react';
import { Calendar, Layers, FileText, FileCode2 } from 'lucide-react';
import DomeBadge from '@/components/ui/DomeBadge';
import { extractCalendarEventFromToolResult, unwrapToolResultPayload } from '@/lib/chat/calendarToolArtifact';
import type { parseTreeToolSummary } from '@/lib/chat/treeToolSummary';
import './tool-result-highlights.css';

export function renderToolSuccessHighlight(
  toolName: string,
  rawResult: unknown,
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string,
): ReactNode | null {
  const cal = extractCalendarEventFromToolResult(toolName, rawResult);
  if (cal) {
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Calendar className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="truncate">{cal.title || t('chat.calendar_event_untitled', { defaultValue: 'Evento' })}</span>
        </div>
        {cal.startLabel ? (
          <p className="text-[12px]" style={{ color: 'var(--secondary-text)' }}>
            {cal.startLabel}
            {cal.endLabel && cal.endLabel !== cal.startLabel ? ` → ${cal.endLabel}` : ''}
          </p>
        ) : null}
        {cal.location ? (
          <p className="text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
            {cal.location}
          </p>
        ) : null}
        {cal.id ? (
          <p className="text-[12px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {cal.id}
          </p>
        ) : null}
      </div>
    );
  }

  const parsed = unwrapToolResultPayload(rawResult);
  if (!parsed) return null;
  const n = (toolName || '').toLowerCase();
  const ok = parsed.success === true || parsed.status === 'success';

  if (n === 'flashcard_create' && ok && parsed.deck && typeof parsed.deck === 'object') {
    const deck = parsed.deck as Record<string, unknown>;
    const title = String(deck.title || '');
    const count = typeof deck.card_count === 'number' ? deck.card_count : 0;
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--success) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Layers className="size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--secondary-text)' }}>
          {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
        </p>
      </div>
    );
  }

  if (n === 'resource_create' && ok && parsed.resource && typeof parsed.resource === 'object') {
    const r = parsed.resource as Record<string, unknown>;
    const title = String(r.title || '');
    const id = String(r.id || '');
    const typ = String(r.type || '');
    return (
      <div
        className="rounded-md border p-2.5 flex gap-2 items-start"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
      >
        <FileText className="size-3.5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
            {title}
          </p>
          <p className="text-[12px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {typ} · {id}
          </p>
        </div>
      </div>
    );
  }

  const st = parsed.status;
  if (st === 'success') {
    const thumb = typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '';
    const cropped = typeof parsed.croppedImage === 'string' ? parsed.croppedImage : '';
    const src = cropped || thumb;
    if (src.startsWith('data:')) {
      return (
        <img
          src={src}
          alt=""
          className="max-w-[220px] max-h-[160px] object-contain rounded-md border border-[var(--border)]"
        />
      );
    }
  }

  return null;
}

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

export function renderTreeToolSummary(summary: ReturnType<typeof parseTreeToolSummary>, t: (key: string, opts?: { defaultValue?: string }) => string) {
  if (!summary) return null;
  return (
    <div className="tool-tree-summary">
      {summary.path ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_path', { defaultValue: 'Ruta' })}: </span>
          <span style={{ wordBreak: 'break-all' }}>{summary.path}</span>
        </div>
      ) : null}
      {summary.shown != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_entries', { defaultValue: 'Entradas' })}: </span>
          {summary.shown}
          {summary.truncated ? ` (${t('chat.tree_tool_truncated', { defaultValue: 'truncado' })})` : ''}
        </div>
      ) : null}
      {summary.max_depth != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_depth', { defaultValue: 'Profundidad' })}: </span>
          {summary.max_depth}
        </div>
      ) : null}
      {summary.node_count != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{t('chat.tree_tool_nodes', { defaultValue: 'Nodos' })}: </span>
          {summary.node_count}
        </div>
      ) : null}
      <p style={{ margin: 0, opacity: 0.85 }}>
        {t('chat.tree_tool_hint', {
          defaultValue: 'Usa file_list o file_tree acotado en lugar de directory_tree en carpetas grandes.',
        })}
      </p>
    </div>
  );
}
