/**
 * Calendar Tools
 *
 * Tools for the AI agent to create, update, delete, and list calendar events.
 * In Many (main-process LangGraph), create/update/delete go through human-in-the-loop approval before applying.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const CalendarCreateSchema = Type.Object({
  title: Type.String({ description: 'Event title.' }),
  start_at: Type.String({
    description: 'Start time in ISO 8601 format (e.g. 2025-03-01T14:00:00 or 2025-03-01T14:00:00Z).',
  }),
  end_at: Type.Optional(
    Type.String({
      description: 'End time in ISO 8601 format. Defaults to 1 hour after start.',
    }),
  ),
  description: Type.Optional(Type.String({ description: 'Event description.' })),
  location: Type.Optional(Type.String({ description: 'Event location.' })),
  all_day: Type.Optional(Type.Boolean({ description: 'Whether the event is all-day.' })),
  idempotency_key: Type.Optional(
    Type.String({
      description: 'Optional key to prevent duplicate events from retries.',
    }),
  ),
});

const CalendarUpdateSchema = Type.Object({
  event_id: Type.String({ description: 'ID of the event to update.' }),
  title: Type.Optional(Type.String({ description: 'New title.' })),
  start_at: Type.Optional(Type.String({ description: 'New start time (ISO 8601).' })),
  end_at: Type.Optional(Type.String({ description: 'New end time (ISO 8601).' })),
  description: Type.Optional(Type.String({ description: 'New description.' })),
  location: Type.Optional(Type.String({ description: 'New location.' })),
  all_day: Type.Optional(Type.Boolean({ description: 'Whether the event is all-day.' })),
});

const CalendarListSchema = Type.Object({
  start_at: Type.String({
    description: 'Start of range in ISO 8601 format.',
  }),
  end_at: Type.String({
    description: 'End of range in ISO 8601 format.',
  }),
});

/** Default look-ahead (~7d). A short default (e.g. 60m) makes “later today” events disappear on follow-up tool calls. */
const DEFAULT_UPCOMING_WINDOW_MINUTES = 10080;

const CalendarUpcomingSchema = Type.Object({
  window_minutes: Type.Optional(
    Type.Number({
      description:
        'Look-ahead window in minutes. Default 10080 (~7 days). Use 180 for 3 hours, 1440 for ~1 day.',
    }),
  ),
  limit: Type.Optional(Type.Number({ description: 'Max events to return. Default 10.' })),
});

const CalendarDeleteSchema = Type.Object({
  event_id: Type.String({ description: 'ID of the event to delete.' }),
});

export function createCalendarCreateTool(): AnyAgentTool {
  return {
    label: 'Crear evento de calendario',
    name: 'calendar_create',
    description:
      'Crea un evento en el calendario del usuario. Usa esta herramienta cuando el usuario pida programar una reunión, recordatorio, cita o cualquier evento. ' +
      'Las fechas deben estar en formato ISO 8601 (ej: 2025-03-01T14:00:00).',
    parameters: CalendarCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Calendar tools require Electron environment.' });
        }

        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const startAt = readStringParam(params, 'start_at', { required: true });
        const endAt = readStringParam(params, 'end_at');
        const description = readStringParam(params, 'description');
        const location = readStringParam(params, 'location');
        const allDay = params.all_day === true;
        const idempotencyKey = readStringParam(params, 'idempotency_key');

        const result = await window.electron.calendar.createEvent({
          title,
          start_at: startAt,
          end_at: endAt || undefined,
          description: description || undefined,
          location: location || undefined,
          all_day: allDay,
          idempotency_key: idempotencyKey || undefined,
        });

        if (!result.success) {
          return jsonResult({ status: 'error', error: result.error || 'Failed to create calendar event.' });
        }

        return jsonResult({
          status: 'success',
          message: `Evento "${title}" creado en el calendario.`,
          event: result.event,
        });
      } catch (error) {
        return jsonResult({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createCalendarUpdateTool(): AnyAgentTool {
  return {
    label: 'Actualizar evento de calendario',
    name: 'calendar_update',
    description:
      'Actualiza un evento existente en el calendario. Usa el event_id del evento a modificar.',
    parameters: CalendarUpdateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Calendar tools require Electron environment.' });
        }

        const params = args as Record<string, unknown>;
        const eventId = readStringParam(params, 'event_id', { required: true });
        const updates: Record<string, unknown> = {};
        if (params.title != null) updates.title = params.title;
        if (params.start_at != null) updates.start_at = params.start_at;
        if (params.end_at != null) updates.end_at = params.end_at;
        if (params.description != null) updates.description = params.description;
        if (params.location != null) updates.location = params.location;
        if (params.all_day != null) updates.all_day = params.all_day;

        const result = await window.electron.calendar.updateEvent(eventId, updates);

        if (!result.success) {
          return jsonResult({ status: 'error', error: result.error || 'Failed to update calendar event.' });
        }

        return jsonResult({
          status: 'success',
          message: 'Evento actualizado.',
          event: result.event,
        });
      } catch (error) {
        return jsonResult({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createCalendarGetUpcomingTool(): AnyAgentTool {
  return {
    label: 'Próximos eventos del calendario',
    name: 'calendar_get_upcoming',
    description:
      'Lista los próximos eventos del calendario desde ahora. Úsala cuando el usuario pregunte qué tiene hoy, esta semana, o su agenda próxima sin dar un rango explícito start/end.',
    parameters: CalendarUpcomingSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Calendar tools require Electron environment.' });
        }

        const params = args as Record<string, unknown>;
        const windowMinutes =
          typeof params.window_minutes === 'number' && params.window_minutes > 0
            ? params.window_minutes
            : typeof params.windowMinutes === 'number' && params.windowMinutes > 0
              ? params.windowMinutes
              : undefined;
        const limit =
          typeof params.limit === 'number' && params.limit > 0 ? params.limit : undefined;

        const result = await window.electron.calendar.getUpcoming({
          windowMinutes: windowMinutes ?? DEFAULT_UPCOMING_WINDOW_MINUTES,
          limit: limit ?? 10,
        });

        if (!result.success) {
          return jsonResult({ status: 'error', error: result.error || 'Failed to load upcoming events.' });
        }

        return jsonResult({
          status: 'success',
          events: result.events || [],
          count: result.events?.length ?? 0,
        });
      } catch (error) {
        return jsonResult({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createCalendarDeleteTool(): AnyAgentTool {
  return {
    label: 'Eliminar evento de calendario',
    name: 'calendar_delete',
    description: 'Elimina un evento del calendario.',
    parameters: CalendarDeleteSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Calendar tools require Electron environment.' });
        }

        const params = args as Record<string, unknown>;
        const eventId = readStringParam(params, 'event_id', { required: true });

        const result = await window.electron.calendar.deleteEvent(eventId);

        if (!result.success) {
          return jsonResult({ status: 'error', error: result.error || 'Failed to delete calendar event.' });
        }

        return jsonResult({
          status: 'success',
          message: 'Evento eliminado.',
        });
      } catch (error) {
        return jsonResult({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createCalendarListTool(): AnyAgentTool {
  return {
    label: 'Listar eventos de calendario',
    name: 'calendar_list',
    description:
      'Lista los eventos del calendario en un rango de fechas. Usa esta herramienta para ver qué tiene programado el usuario.',
    parameters: CalendarListSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Calendar tools require Electron environment.' });
        }

        const params = args as Record<string, unknown>;
        const startAt = readStringParam(params, 'start_at', { required: true });
        const endAt = readStringParam(params, 'end_at', { required: true });

        const startMs = new Date(startAt).getTime();
        const endMs = new Date(endAt).getTime();
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
          return jsonResult({ status: 'error', error: 'Invalid date format. Use ISO 8601.' });
        }

        const result = await window.electron.calendar.listEvents({
          startMs,
          endMs,
        });

        if (!result.success) {
          return jsonResult({ status: 'error', error: result.error || 'Failed to list calendar events.' });
        }

        return jsonResult({
          status: 'success',
          events: result.events || [],
          count: result.events?.length ?? 0,
        });
      } catch (error) {
        return jsonResult({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export function createCalendarTools(): AnyAgentTool[] {
  return [
    createCalendarCreateTool(),
    createCalendarUpdateTool(),
    createCalendarDeleteTool(),
    createCalendarListTool(),
    createCalendarGetUpcomingTool(),
  ];
}
