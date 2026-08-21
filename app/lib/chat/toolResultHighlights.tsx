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

/** True when a tool payload reports success via either convention. */
function isSuccessPayload(parsed: Record<string, unknown>): boolean {
  return parsed.success === true || parsed.status === 'success';
}

/** Narrow a truthy object-like value (same guard as the pre-refactor `&& typeof === 'object'`). */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function calendarTimeLabel(cal: CalendarHighlight): string {
  if (!cal.endLabel || cal.endLabel === cal.startLabel) return cal.startLabel;
  return `${cal.startLabel} → ${cal.endLabel}`;
}

function renderCalendarHighlight(cal: CalendarHighlight, t: TFunction): ReactNode {
  const title = cal.title || t('chat.calendar_event_untitled', { defaultValue: 'Evento' });
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
        <span className="truncate">{title}</span>
      </div>
      {cal.startLabel ? (
        <p className="text-[12px] text-muted-foreground">
          {calendarTimeLabel(cal)}
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

function tryFlashcardHighlight(
  toolName: string,
  parsed: Record<string, unknown>,
  t: TFunction,
): ReactNode | null {
  if (toolName !== 'flashcard_create') return null;
  if (!isSuccessPayload(parsed)) return null;
  const deck = asRecord(parsed.deck);
  if (!deck) return null;
  return renderFlashcardHighlight(deck, t);
}

function tryResourceHighlight(
  toolName: string,
  parsed: Record<string, unknown>,
): ReactNode | null {
  if (toolName !== 'resource_create') return null;
  if (!isSuccessPayload(parsed)) return null;
  const resource = asRecord(parsed.resource);
  if (!resource) return null;
  return renderResourceHighlight(resource);
}

/**
 * Inline success card for calendar / flashcard / resource / image tool results.
 * Dispatch only — per-type rendering lives in helpers (S3776).
 */
export function renderToolSuccessHighlight(
  toolName: string,
  rawResult: unknown,
  t: TFunction,
): ReactNode | null {
  const cal = extractCalendarEventFromToolResult(toolName, rawResult);
  if (cal) return renderCalendarHighlight(cal, t);

  const parsed = unwrapToolResultPayload(rawResult);
  if (!parsed) return null;

  const n = toolName.toLowerCase();
  const flashcard = tryFlashcardHighlight(n, parsed, t);
  if (flashcard) return flashcard;

  const resource = tryResourceHighlight(n, parsed);
  if (resource) return resource;

  return renderImageHighlight(parsed);
}
