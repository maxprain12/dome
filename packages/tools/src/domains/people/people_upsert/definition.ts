import type { ToolDefinition } from '../../../types.js';

export const peopleUpsertDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_upsert',
    description:
      'Create or update a person with a complete profile. Merges profile keys. ' +
      'Identities include website, email, social, phone, document. Source: People.',
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
          description:
            'lead | prospect | qualified | customer | partner | vendor | investor | colleague | personal | archived, or a custom slug',
        },
        discovered_via: { type: 'string', description: 'How we met / source label.' },
        profile: {
          type: 'object',
          description:
            'Complete freeform profile (occupation, company, website, phone, location, how_we_met, plus any other facts). Merges with existing keys.',
        },
        identities: {
          type: 'array',
          description: 'Optional identities to link after upsert.',
          items: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description:
                  'github | email | website | phone | document | calendar | company | social_x | social_linkedin | social_instagram | social_facebook | social_tiktok | social_youtube | manual',
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
