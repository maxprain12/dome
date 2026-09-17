import type { ToolDefinition } from '../../../types.js';

export const socialReferenceListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_reference_list',
    description:
      'List saved social references (third-party posts/profiles) with author, format, provenance and limitations. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max references (default 40).' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
