import type { ToolDefinition } from '../../../types.js';

export const socialCampaignCreateDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_campaign_create',
    description:
      'Create (or return existing) a soft social campaign by name. Does not publish posts. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name (unique).' },
        goal: { type: 'string', description: 'Short goal / brief for the campaign.' },
      },
      required: ['name'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
