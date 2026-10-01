import type { ToolDefinition } from '../../../types.js';

export const socialPublicResolveDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_public_resolve',
    description:
      'Resolve existing social evidence; third-party profile research starts with research_capabilities. ' +
      'Uses local matches and public Instagram/X snapshots. LinkedIn remote access is pending even with browser login; ' +
      'analyze imported/local evidence instead. Never invent metrics. Source: Social hub.',
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
