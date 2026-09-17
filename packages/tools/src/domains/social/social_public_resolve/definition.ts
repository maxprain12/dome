import type { ToolDefinition } from '../../../types.js';

export const socialPublicResolveDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_public_resolve',
    description:
      'Resolve a public Instagram, X or LinkedIn profile/post URL into a structured card. ' +
      'Uses local matches, Open Graph, or an explicit requires_browser limitation. Never invent metrics. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public https URL of a profile or post.' },
      },
      required: ['url'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
