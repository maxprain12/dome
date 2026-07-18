/**
 * Pipeline (Kanban) tools — list boards, create/move cards, run stage agents.
 * Many runs execute via main-process dispatcher (toolDefinitions → createToolRegistry).
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult } from './common';

const mainOnly = () =>
  jsonResult({
    success: false,
    error: 'Pipeline tools run in the Dome agent runtime (Many). Retry from chat.',
  });

export function createPipelineListTool(): AnyAgentTool {
  return {
    label: 'List pipelines',
    name: 'pipeline_list',
    description:
      "List the user's pipelines (Kanban boards) in the active project. Use before creating cards to find the right pipeline_id.",
    parameters: Type.Object({}),
    execute: async () => mainOnly(),
  };
}

export function createPipelineGetTool(): AnyAgentTool {
  return {
    label: 'Get pipeline',
    name: 'pipeline_get',
    description:
      'Get a pipeline with its stages and cards (items). Returns stage ids/titles and card ids/statuses. Use to find stage_id or item_id.',
    parameters: Type.Object({
      pipeline_id: Type.String({ description: 'ID of the pipeline' }),
    }),
    execute: async () => mainOnly(),
  };
}

export function createPipelineCreateCardTool(): AnyAgentTool {
  return {
    label: 'Create pipeline card',
    name: 'pipeline_create_card',
    description:
      'Create a card (item) in a pipeline, e.g. a new lead. Defaults to the first stage if stage_id is omitted. Set start_at/end_at (ISO 8601) to make it appear in the calendar.',
    parameters: Type.Object({
      pipeline_id: Type.String({ description: 'Target pipeline ID (required)' }),
      title: Type.String({ description: 'Card title (required)' }),
      stage_id: Type.Optional(Type.String({ description: 'Optional stage ID; defaults to the first stage' })),
      data: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: 'Arbitrary business data for the card',
        }),
      ),
      start_at: Type.Optional(Type.String({ description: 'Optional start date/time as ISO 8601' })),
      end_at: Type.Optional(Type.String({ description: 'Optional end/deadline as ISO 8601' })),
    }),
    execute: async () => mainOnly(),
  };
}

export function createPipelineMoveCardTool(): AnyAgentTool {
  return {
    label: 'Move pipeline card',
    name: 'pipeline_move_card',
    description:
      'Move a card to another stage. If the destination stage auto-runs an agent, the run starts automatically.',
    parameters: Type.Object({
      item_id: Type.String({ description: 'ID of the card to move (required)' }),
      to_stage_id: Type.String({ description: 'Destination stage ID (required)' }),
    }),
    execute: async () => mainOnly(),
  };
}

export function createPipelineRunCardTool(): AnyAgentTool {
  return {
    label: 'Run pipeline card',
    name: 'pipeline_run_card',
    description: "Run the stage's assigned agent on a card now (for stages with a manual-agent policy).",
    parameters: Type.Object({
      item_id: Type.String({ description: 'ID of the card to run (required)' }),
    }),
    execute: async () => mainOnly(),
  };
}

export function createPipelineAddStageTool(): AnyAgentTool {
  return {
    label: 'Add pipeline stage',
    name: 'pipeline_add_stage',
    description:
      'Add a stage (column) to a pipeline. execution_policy: auto_agent (runs on entry), manual_agent (run button), or manual_resolve (no agent).',
    parameters: Type.Object({
      pipeline_id: Type.String({ description: 'Pipeline ID' }),
      title: Type.String({ description: 'Stage title' }),
      execution_policy: Type.Optional(
        Type.Union(
          [Type.Literal('auto_agent'), Type.Literal('manual_agent'), Type.Literal('manual_resolve')],
          { description: 'How the stage runs agents (default manual_resolve).' },
        ),
      ),
      assigned_agent_id: Type.Optional(Type.String({ description: 'Optional agent id for the stage' })),
    }),
    execute: async () => mainOnly(),
  };
}

export function createPipelineTools(): AnyAgentTool[] {
  return [
    createPipelineListTool(),
    createPipelineGetTool(),
    createPipelineCreateCardTool(),
    createPipelineMoveCardTool(),
    createPipelineRunCardTool(),
    createPipelineAddStageTool(),
  ];
}
