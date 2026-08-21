import type { ToolDefinition } from '../../../types.js';

export const peopleUpsertDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_upsert',
    description:
      'Create or update a person in Dome People (canonical CRM). Optional identities ' +
      '(social_instagram, email, github, …). Leads are people with lead_status=lead. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Display name (required for create).' },
        person_id: { type: 'string', description: 'Existing person id to update.' },
        project_id: { type: 'string', description: 'Project id (default: default).' },
        primary_email: { type: 'string', description: 'Primary email.' },
        notes: { type: 'string', description: 'Internal notes.' },
        lead_status: {
          type: 'string',
          description: 'lead | customer | archived',
        },
        identities: {
          type: 'array',
          description: 'Optional identities to link after upsert.',
          items: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'github | email | social_x | social_linkedin | social_instagram | manual',
              },
              external_id: { type: 'string' },
              display_label: { type: 'string' },
            },
            required: ['source', 'external_id'],
          },
        },
      },
      required: ['display_name'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
