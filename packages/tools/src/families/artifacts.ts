/**
 * @dome/tools — `artifacts` family definitions (persisted iframe mini-apps).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The artifacts-family tool names (subset of the 103-tool catalog). */
export const ARTIFACTS_TOOL_NAMES = [
  'artifact_create',
  'artifact_get',
  'artifact_merge_data',
  'artifact_update_state',
  'artifact_list',
  'artifact_delete',
  'artifact_link_resource',
  'artifact_design',
] as const;

export type ArtifactsToolName = (typeof ARTIFACTS_TOOL_NAMES)[number];

export function artifactsToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'artifact_create',
        description:
          'Create a persisted interactive artifact (mini-app) as a resource. Sandboxed iframe — MUST use window.DOME_DATA + window.__dome_updateState after each user change for SQLite persistence; NEVER localStorage/sessionStorage/IndexedDB for app data. ' +
          'Types: task-tracker, chart, custom. Set html (fragment) and optional data (initial DOME_DATA). ' +
          'CSS variables --bg, --accent, etc. are injected.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Display title. Optional — if omitted, derived from HTML <title> tag, then artifact_type, then "Untitled Artifact".',
            },
            artifact_type: {
              type: 'string',
              enum: ['task-tracker', 'chart', 'custom'],
              description: 'Semantic type',
            },
            html: { type: 'string', description: 'Self-contained HTML/CSS/JS' },
            data: { type: 'object', description: 'Initial structured data for DOME_DATA' },
            project_id: { type: 'string', description: 'Project ID (default: current)' },
          },
          required: ['artifact_type', 'html'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_get',
        description: 'Get full artifact state (html, data, metadata) by resource ID.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Artifact resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_merge_data',
        description:
          'Shallow-merge keys into persisted artifact state.data without resending HTML. Use after excel_get / resource_get to push rows, counters, or blobs. Top-level keys replace or add; nested subtrees replace by key. Prefer over pasting huge datasets into HTML.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Artifact resource ID' },
            data_patch: { type: 'object', description: 'Partial state.data (merged shallowly)' },
          },
          required: ['resource_id', 'data_patch'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_update_state',
        description:
          'Update an artifact: pass html and/or data (merged with existing). In-iframe JS must sync with __dome_updateState; do not use browser storage for durable state. Omit fields you do not change.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Artifact resource ID' },
            html: { type: 'string', description: 'New self-contained HTML if replacing UI' },
            data: {
              description: 'New structured data merged into state (object or JSON string)',
            },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_list',
        description: 'List persisted artifacts in a project (titles, ids, types).',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID (default: current)' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_delete',
        description: 'Delete a persisted artifact resource and remove it from the library.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Artifact resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_link_resource',
        description:
          'Link (or unlink) a persisted artifact to an Excel/spreadsheet resource. ' +
          'Once linked: Dome auto-refreshes the artifact whenever the spreadsheet is edited and exposes all sheet data as window.DOME_DATA.linkedData.sheets[sheetName]. ' +
          'A "Refresh data" button appears in the artifact toolbar. ' +
          'Use this when the user asks to link a dashboard to an Excel, or when an artifact was created without linkedResourceId. ' +
          'Pass linked_resource_id=null to remove the link.',
        parameters: {
          type: 'object',
          properties: {
            artifact_resource_id: { type: 'string', description: 'Resource ID of the artifact to link' },
            linked_resource_id: {
              type: ['string', 'null'],
              description: 'Resource ID of the Excel/spreadsheet to link to, or null to unlink',
            },
          },
          required: ['artifact_resource_id', 'linked_resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_design',
        description:
          'Build Dome-themed HTML + initial state.data for a persisted library artifact (tabbed dossier: header, tabs, section cards, badges, lists, code blocks). ' +
          'Uses only injected CSS variables; escapes content. Does NOT persist — pass returned html and data to artifact_create (artifact_type: custom). ' +
          'Call dome_load_doc with id artifact_design before first use to read the full JSON spec.',
        parameters: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              description:
                'Layout spec: title (required), optional subtitle, title_emoji (single optional emoji), active_tab (optional), tabs[] { id, label }, panels { [tabId]: { sections[] with kicker, optional badge, badge_tone: neutral|info|success|warning|error, blocks[]: type paragraph|numbered|bullets|code } } }',
            },
          },
          required: ['spec'],
        },
      },
    },
  ];
}
