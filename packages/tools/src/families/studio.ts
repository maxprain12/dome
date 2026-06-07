/**
 * @dome/tools — `studio` family definitions (Learn / studio content gatherers).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The studio-family tool names (subset of the 103-tool catalog). */
export const STUDIO_TOOL_NAMES = [
  'generate_knowledge_graph',
  'generate_mindmap',
  'generate_quiz',
  'generate_guide',
  'generate_faq',
  'generate_timeline',
  'generate_table',
] as const;

export type StudioToolName = (typeof STUDIO_TOOL_NAMES)[number];

export function studioToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'generate_knowledge_graph',
        description:
          'Build a semantic similarity graph around a focus resource (from library embeddings). Pass focus_resource_id or source_ids (first id used as focus).',
        parameters: {
          type: 'object',
          properties: {
            focus_resource_id: { type: 'string', description: 'Center resource id' },
            source_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional; first id used as focus if focus_resource_id omitted',
            },
            min_weight: { type: 'number', description: 'Min edge similarity 0-1 (default 0.35)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_mindmap',
        description:
          'Gather source snippets from library resources to help you produce a mind map or artifact:diagram. Does not build the graph structure itself—call after resolving resource IDs.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Scope listing when source_ids omitted' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs to summarize' },
            resource_id: { type: 'string', description: 'Single source resource ID' },
            topic: { type: 'string', description: 'Optional focus topic label' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_quiz',
        description:
          'Gather source content from resources so you can output a structured quiz (type quiz) in the reply. Call only when user asks for quiz/test/questions.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID (shorthand for one-item source_ids)' },
            num_questions: { type: 'number', description: '1-20, default 5' },
            difficulty: { type: 'string', description: 'easy | medium | hard' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_guide',
        description:
          'Gather source content so you can output a structured study guide (type guide) in the reply. Call only when the user asks for a guide or guía de estudio.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_faq',
        description:
          'Gather source content so you can output FAQ Q&A pairs (type faq) in the reply. Call only when the user asks for FAQ or preguntas frecuentes.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_timeline',
        description:
          'Gather source content so you can output a chronological timeline (type timeline) in the reply. Call only when the user asks for timeline or cronología.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_table',
        description:
          'Gather source content so you can output a data table (type table) in the reply. Call only when the user asks for table, tabla, or comparison matrix.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
  ];
}
