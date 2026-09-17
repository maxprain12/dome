import type { ToolDefinition } from '../../../types.js';

export const socialCampaignFromReferencesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_campaign_from_references',
    description:
      'Create a social campaign and link selected saved references as inspiration. Does not publish. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name.' },
        goal: { type: 'string', description: 'Short brief. Mention which hooks/formats come from which references.' },
        reference_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Saved reference ids (sr-…) to attach as inspiration.',
        },
      },
      required: ['name'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
