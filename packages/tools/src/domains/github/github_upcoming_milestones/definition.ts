import type { ToolDefinition } from '../../../types.js';

export const githubUpcomingMilestonesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_upcoming_milestones',
    description:
      'List milestones across ALL synced GitHub repos sorted by delivery date (due_on). Use for fechas de entrega, próximos hitos. Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max milestones (default 30)' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter state (default all)' },
        include_past_due: { type: 'boolean', description: 'Include past due_on dates (default true)' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
