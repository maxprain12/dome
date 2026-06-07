/**
 * On-demand reference docs (dome_load_doc) and meta tools for Many / agents.
 * Execution is handled in the main process via executeToolInMain → tool-dispatcher.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';

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

const DOME_LOAD_DOC_DESCRIPTION =
  'Load a reference doc section on demand. Call BEFORE using tools that require it. ' +
  'Valid ids: entity_rules, artifacts, artifact_persisted, artifact_design, feeders, resource_links, ' +
  'ppt_tool, docx_tool, calendar_tool, flashcard_tool, excel_notebook_tool, excel_artifact_tool.';

export function createDomeLoadDocTool(): AnyAgentTool {
  return {
    label: 'Load Doc',
    name: 'dome_load_doc',
    description: DOME_LOAD_DOC_DESCRIPTION,
    parameters: Type.Object({
      id: Type.String({
        enum: [...DOME_LOAD_DOC_IDS],
        description: 'Section identifier',
      }),
    }),
    execute: async () => {
      return { content: [{ type: 'text', text: 'dome_load_doc runs in the main process during agent runs.' }] };
    },
  };
}

export function createGetToolDefinitionTool(): AnyAgentTool {
  return {
    label: 'Get Tool Definition',
    name: 'get_tool_definition',
    description:
      'Get the full schema (name, description, parameters) of any tool (Dome or MCP). ' +
      'Use when you need exact parameters before calling a tool.',
    parameters: Type.Object({
      tool_name: Type.String({ description: 'Normalized tool name (e.g. resource_search, artifact_create)' }),
    }),
    execute: async () => {
      return { content: [{ type: 'text', text: 'get_tool_definition runs in the main process during agent runs.' }] };
    },
  };
}

export function createSkillReadTool(): AnyAgentTool {
  return {
    label: 'Read Skill File',
    name: 'skill_read',
    description:
      'Read a text file from an installed Dome skill (~/.dome/skills/<skill_id>/). ' +
      'For artifact_persisted, artifact_design, or artifacts docs use dome_load_doc(id) instead.',
    parameters: Type.Object({
      skill_id: Type.String({ description: 'Skill folder name, e.g. "pptx".' }),
      path: Type.String({ description: 'Relative path within the skill folder, e.g. "editing.md".' }),
    }),
    execute: async () => {
      return { content: [{ type: 'text', text: 'skill_read runs in the main process during agent runs.' }] };
    },
  };
}

export function createDocsTools(): AnyAgentTool[] {
  return [createDomeLoadDocTool(), createGetToolDefinitionTool(), createSkillReadTool()];
}
