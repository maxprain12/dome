/**
 * @dome/tools — `docs` family definitions (meta / on-demand reference tools).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 *
 * `dome_load_doc`'s description/enum come from
 * `shared/prompt-assembler/index.cjs` (`DOME_LOAD_DOC_DESCRIPTION` /
 * `DOME_LOAD_DOC_IDS`). Those are inlined here verbatim so this module stays a
 * pure, renderer-safe definition (no `electron/` or `shared/` Node require).
 */

import type { ToolDefinition } from '../types.js';

/** The docs-family tool names (subset of the 103-tool catalog). */
export const DOCS_TOOL_NAMES = ['dome_load_doc', 'get_tool_definition', 'skill_read'] as const;

export type DocsToolName = (typeof DOCS_TOOL_NAMES)[number];

/** Mirror of `DOME_LOAD_DOC_IDS` (shared/prompt-assembler/index.cjs). */
const DOME_LOAD_DOC_IDS = [
  'entity_rules',
  'artifacts',
  'artifact_persisted',
  'artifact_design',
  'feeders',
  'resource_links',
  'ppt_tool',
  'docx_tool',
  'calendar_tool',
  'flashcard_tool',
  'excel_notebook_tool',
  'excel_artifact_tool',
] as const;

/** Mirror of `DOME_LOAD_DOC_DESCRIPTION` (shared/prompt-assembler/index.cjs). */
const DOME_LOAD_DOC_DESCRIPTION =
  'Load a reference doc section on demand. Call BEFORE using tools that require it. Valid ids: entity_rules (before agent_create/workflow_create/automation_create/marketplace_install), artifacts (before emitting any artifact block), artifact_persisted (before artifact_create/artifact_update_state/artifact_delete), artifact_design (before artifact_create or artifact_design tool), feeders (before feeder_create/feeder_run), resource_links (if unsure about dome:// link format), ppt_tool (before ppt_create), docx_tool (before docx_create/docx_update), calendar_tool (before calendar_create_event), flashcard_tool (before flashcard_create), excel_notebook_tool (before Excel→notebook pandas flow), excel_artifact_tool (before Excel→artifact dashboard).';

export function docsToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'dome_load_doc',
        description: DOME_LOAD_DOC_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              enum: [...DOME_LOAD_DOC_IDS],
              description: 'Section identifier',
            },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_tool_definition',
        description:
          'Get the full schema (name, description, parameters) of any tool (Dome or MCP). Use when you need to see the exact parameters of a tool before calling it. Reduces token usage by loading definitions on demand.',
        parameters: {
          type: 'object',
          properties: {
            tool_name: { type: 'string', description: 'Normalized tool name (e.g. resource_search, stripe_create_payment)' },
          },
          required: ['tool_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'skill_read',
        description:
          'Read a text file from an installed Dome skill (~/.dome/skills/<skill_id>/). Use for auxiliary skill docs referenced in SKILL.md.',
        parameters: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', description: 'Skill folder name, e.g. "pptx".' },
            path: { type: 'string', description: 'Relative path within the skill folder, e.g. "editing.md".' },
          },
          required: ['skill_id', 'path'],
        },
      },
    },
  ];
}
