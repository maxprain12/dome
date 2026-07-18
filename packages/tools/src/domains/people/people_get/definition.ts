import type { ToolDefinition } from '../../../types.js';

export const peopleGetDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_get',
    description:
      'Get one person by id from Dome People (display name, email, linked identities for GitHub/email/social). ' +
      'Use when mentioned-people lists a person id. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        person_id: {
          type: 'string',
          description: 'Person id from mentioned-people.',
        },
      },
      required: ['person_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
