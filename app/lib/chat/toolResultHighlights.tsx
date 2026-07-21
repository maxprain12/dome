import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon,
  Layers01Icon,
  File02Icon,
} from '@hugeicons/core-free-icons';
import type { ReactNode } from 'react';
import { extractCalendarEventFromToolResult, unwrapToolResultPayload } from '@/lib/chat/calendarToolArtifact';

type TFunction = (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string;

type CalendarHighlight = NonNullable<ReturnType<typeof extractCalendarEventFromToolResult>>;

function renderCalendarHighlight(cal: CalendarHighlight, t: TFunction): ReactNode {
  return (
    <div
      className="rounded-md border p-2.5 flex flex-col gap-y-1"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{cal.title || t('chat.calendar_event_untitled', { defaultValue: 'Evento' })}</span>
      </div>
      {cal.startLabel ? (
        <p className="text-[12px] text-muted-foreground">
          {cal.startLabel}
          {cal.endLabel && cal.endLabel !== cal.startLabel ? ` → ${cal.endLabel}` : ''}
        </p>
      ) : null}
      {cal.location ? (
        <p className="text-[12px] text-muted-foreground">
          {cal.location}
        </p>
      ) : null}
      {cal.id ? (
        <p className="text-[12px] font-mono opacity-70 truncate text-muted-foreground">
          {cal.id}
        </p>
      ) : null}
    </div>
  );
}

function renderFlashcardHighlight(deck: Record<string, unknown>, t: TFunction): ReactNode {
  const title = String(deck.title || '');
  const count = typeof deck.card_count === 'number' ? deck.card_count : 0;
  return (
    <div
      className="rounded-md border p-2.5 flex flex-col gap-y-1"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--success) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <HugeiconsIcon icon={Layers01Icon} className="size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
        <span className="truncate">{title}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
      </p>
    </div>
  );
}

function renderResourceHighlight(resource: Record<string, unknown>): ReactNode {
  const title = String(resource.title || '');
  const id = String(resource.id || '');
  const typ = String(resource.type || '');
  return (
    <div
      className="rounded-md border p-2.5 flex gap-2 items-start"
      style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
    >
      <HugeiconsIcon icon={File02Icon} className="size-3.5 shrink-0 mt-0.5 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate text-foreground">
          {title}
        </p>
        <p className="text-[12px] font-mono opacity-70 truncate text-muted-foreground">
          {typ} · {id}
        </p>
      </div>
    </div>
  );
}

function renderImageHighlight(parsed: Record<string, unknown>): ReactNode | null {
  if (parsed.status !== 'success') return null;
  const thumb = typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '';
  const cropped = typeof parsed.croppedImage === 'string' ? parsed.croppedImage : '';
  const src = cropped || thumb;
  if (!src.startsWith('data:')) return null;
  return (
    <img
      src={src}
      alt=""
      className="max-w-[220px] max-h-[160px] object-contain rounded-md border border-border"
    />
  );
}

export function renderToolSuccessHighlight(
  toolName: string,
  rawResult: unknown,
  t: TFunction,
): ReactNode | null {
  const cal = extractCalendarEventFromToolResult(toolName, rawResult);
  if (cal) return renderCalendarHighlight(cal, t);

  const parsed = unwrapToolResultPayload(rawResult);
  if (!parsed) return null;

  const n = (toolName || '').toLowerCase();
  const ok = parsed.success === true || parsed.status === 'success';

  if (n === 'flashcard_create' && ok && parsed.deck && typeof parsed.deck === 'object') {
    return renderFlashcardHighlight(parsed.deck as Record<string, unknown>, t);
  }

  if (n === 'resource_create' && ok && parsed.resource && typeof parsed.resource === 'object') {
    return renderResourceHighlight(parsed.resource as Record<string, unknown>);
  }

  return renderImageHighlight(parsed);
}