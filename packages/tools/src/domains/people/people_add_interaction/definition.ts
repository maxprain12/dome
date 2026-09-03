import type { ToolDefinition } from '../../../types.js';

export const peopleAddInteractionDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_add_interaction',
    description:
      'Append a timeline note or source event to a person (meeting, email, document, call). ' +
      'Use when the user tells you something to remember about someone. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        person_id: { type: 'string' },
        kind: {
          type: 'string',
          description: 'note | meeting | email | document | call | web (default note).',
        },
        summary: { type: 'string', description: 'What to remember, in the user language.' },
        ref_type: { type: 'string', description: 'resource | email | event | …' },
        ref_id: { type: 'string', description: 'Linked resource / email / event id.' },
        project_id: { type: 'string' },
      },
      required: ['person_id', 'summary'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
