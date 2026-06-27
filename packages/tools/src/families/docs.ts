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
import { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS } from '../domains/manifest.js';

/** The docs-family tool names (subset of the 103-tool catalog). */
export const DOCS_TOOL_NAMES = ['dome_load_doc', 'get_tool_definition', 'skill_read'] as const;

export type DocsToolName = (typeof DOCS_TOOL_NAMES)[number];

export { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS };

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
          'Read a text file from an installed Dome skill (~/.dome/skills/<skill_id>/). Use for auxiliary skill docs referenced in SKILL.md. ' +
          'Do NOT use for artifact_persisted, artifact_design, or artifacts — call dome_load_doc(id) instead.',
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
