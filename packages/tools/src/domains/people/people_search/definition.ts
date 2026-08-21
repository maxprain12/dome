import type { ToolDefinition } from '../../../types.js';

export const peopleSearchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_search',
    description:
      'Search Dome People (leads/contacts) by display name, handle, or email. ' +
      'Use before people_get when you only have a name or Instagram handle. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name, @handle, or email fragment.',
        },
        project_id: {
          type: 'string',
          description: 'Optional project id (default: default).',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 20).',
        },
      },
      required: ['query'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
