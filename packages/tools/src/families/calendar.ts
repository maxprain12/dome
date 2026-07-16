/**
 * @dome/tools — `calendar` family definitions.
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The calendar-family tool names (subset of the 103-tool catalog). */
export const CALENDAR_TOOL_NAMES = [
  'calendar_list_events',
  'calendar_get_upcoming',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
] as const;

export type CalendarToolName = (typeof CALENDAR_TOOL_NAMES)[number];

export function calendarToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'calendar_list_events',
        description:
          "You have direct access to the user's calendar. List events in a date range. Use when the user asks 'what do I have between X and Y?' or for a specific date range. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            start_at: {
              type: 'string',
              description: 'Start of range as ISO 8601 string (e.g. "2026-03-15T00:00:00"). Defaults to now.',
            },
            end_at: {
              type: 'string',
              description: 'End of range as ISO 8601 string. Defaults to 7 days from start.',
            },
            calendar_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific calendar IDs. Omit for all calendars.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_get_upcoming',
        description:
          "You have direct access to the user's calendar. Use this immediately when they ask about their schedule, upcoming events, or 'what do I have today/week'. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            window_minutes: {
              type: 'number',
              description: 'Look-ahead window in minutes. Default ~7 days (10080). Use 180 for a few hours, 1440 for ~1 day.',
            },
            limit: { type: 'number', description: 'Max events to return. Default: 10.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_create_event',
        description:
          "Create the event directly in the user's calendar. Never generate .ics files or ask the user to import manually. Infer date from 'tomorrow', 'next week'; infer time (use PM for afternoon hours like 5:15 in Spain). Use reminders: [{\"minutes\": 1440}, {\"minutes\": 120}] by default.",
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title (required)' },
            description: { type: 'string', description: 'Optional description or notes' },
            location: { type: 'string', description: 'Optional location' },
            start_at: { type: 'string', description: 'Start time as ISO 8601 string, e.g. "2026-03-15T14:00:00" (required)' },
            end_at: { type: 'string', description: 'End time as ISO 8601 string (required)' },
            all_day: { type: 'boolean', description: 'True for all-day events' },
            resource_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional Dome resource ids to link (stored as metadata.resourceIds).',
            },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
              description: 'Reminder alerts, e.g. [{"minutes": 15}]',
            },
          },
          required: ['title', 'start_at', 'end_at'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_update_event',
        description:
          'Update an existing calendar event. Only include fields that should change. Use calendar_list_events first if you need the event_id.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to update (required)' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            location: { type: 'string', description: 'New location' },
            start_at: { type: 'string', description: 'New start time as ISO 8601 string' },
            end_at: { type: 'string', description: 'New end time as ISO 8601 string' },
            all_day: { type: 'boolean' },
            resource_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replace linked Dome resource ids (metadata.resourceIds).',
            },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
            },
          },
          required: ['event_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_delete_event',
        description:
          'Permanently delete a calendar event. Ask for confirmation before calling unless the user explicitly said to delete.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to delete' },
          },
          required: ['event_id'],
        },
      },
    },
  ];
}
