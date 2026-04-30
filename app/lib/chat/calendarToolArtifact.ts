import type { CalendarEventArtifactV } from '@/lib/chat/artifactSchemas';

const CALENDAR_EVENT_TOOLS = new Set([
  'calendar_create',
  'calendar_create_event',
  'calendar_update',
  'calendar_update_event',
]);

/** Unwrap LangGraph / jsonResult shapes so we read the payload object. */
export function unwrapToolResultPayload(result: unknown): Record<string, unknown> | null {
  if (result == null) return null;
  if (typeof result === 'string') {
    try {
      return unwrapToolResultPayload(JSON.parse(result));
    } catch {
      return null;
    }
  }
  if (typeof result !== 'object' || Array.isArray(result)) return null;
  const o = result as Record<string, unknown>;
  if (o.details != null && typeof o.details === 'object' && !Array.isArray(o.details)) {
    return unwrapToolResultPayload(o.details);
  }
  return o;
}

function toIso(v: unknown): string {
  if (typeof v === 'number' && !Number.isNaN(v)) return new Date(v).toISOString();
  if (typeof v === 'string' && v.trim()) return v;
  return '';
}

/**
 * Calendar tool result → validated artifact + display fields (tool highlight).
 */
export function extractCalendarEventFromToolResult(
  toolName: string,
  result: unknown,
): {
  title: string;
  startLabel: string;
  endLabel: string;
  id: string;
  location?: string;
  artifact: CalendarEventArtifactV;
} | null {
  const n = (toolName || '').trim().toLowerCase();
  if (!CALENDAR_EVENT_TOOLS.has(n)) return null;
  const parsed = unwrapToolResultPayload(result);
  if (!parsed) return null;
  const ok = parsed.success === true || parsed.status === 'success';
  if (!ok) return null;
  const ev = parsed.event;
  if (ev == null || typeof ev !== 'object' || Array.isArray(ev)) return null;
  const e = ev as Record<string, unknown>;
  const title = typeof e.title === 'string' ? e.title : '';
  const startAt = toIso(e.start_at ?? e.startAt);
  let endAt = toIso(e.end_at ?? e.endAt);
  if (!endAt && startAt) {
    const ms = new Date(startAt).getTime();
    if (!Number.isNaN(ms)) endAt = new Date(ms + 3600_000).toISOString();
  }
  if (!title || !startAt || !endAt) return null;
  const eventId = typeof e.id === 'string' ? e.id : '';
  const location = typeof e.location === 'string' ? e.location : undefined;
  const allDay = e.all_day === true || e.allDay === true;
  const artifact: CalendarEventArtifactV = {
    type: 'calendar_event',
    title,
    start_at: startAt,
    end_at: endAt,
    event_id: eventId || undefined,
    location,
    all_day: allDay,
  };
  return {
    title,
    startLabel: startAt,
    endLabel: endAt,
    id: eventId,
    location,
    artifact,
  };
}

export function calendarArtifactFromToolCalls(
  toolCalls: Array<{ name: string; status: string; result?: unknown }>,
): CalendarEventArtifactV | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const tc = toolCalls[i];
    if (tc.status !== 'success') continue;
    const extracted = extractCalendarEventFromToolResult(tc.name, tc.result);
    if (extracted) return extracted.artifact;
  }
  return null;
}
