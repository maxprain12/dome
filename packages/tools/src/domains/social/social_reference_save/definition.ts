import type { ToolDefinition } from '../../../types.js';

export const socialReferenceSaveDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_reference_save',
    description:
      'Save a third-party social post or profile as a reference (not a publishable post). Dedupes by canonical URL. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public https URL to capture.' },
        notes: { type: 'string', description: 'Optional curator notes.' },
        collection_id: { type: 'string', description: 'Optional collection id to add the reference to.' },
      },
      required: ['url'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
