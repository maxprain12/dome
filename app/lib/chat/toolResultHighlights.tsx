import type { ReactNode } from 'react';
import { Calendar, Layers, FileText } from 'lucide-react';
import { extractCalendarEventFromToolResult, unwrapToolResultPayload } from '@/lib/chat/calendarToolArtifact';

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
