import type { ToolDefinition } from '../../../types.js';

export const socialCampaignsListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_campaigns_list',
    description:
      'List soft social campaigns (name, goal, status, post counts). Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'archived'],
          description: 'Filter by status. Omit for all.',
        },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
