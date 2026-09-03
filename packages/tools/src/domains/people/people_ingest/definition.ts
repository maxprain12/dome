import type { ToolDefinition } from '../../../types.js';

const IDENTITY_SOURCES =
  'github | email | website | phone | document | calendar | company | ' +
  'social_x | social_linkedin | social_instagram | social_facebook | ' +
  'social_tiktok | social_youtube | manual';

export const peopleIngestDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_ingest',
    description:
      'Extract and save one or more complete people from a document, meeting, email, or URL. ' +
      'Read the source first (resource_get / email_read), then persist every relevant lead with ' +
      'full profile + identities. Documents and people are first-class. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        people: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              display_name: { type: 'string' },
              person_id: { type: 'string' },
              primary_email: { type: 'string' },
              notes: { type: 'string' },
              lead_status: { type: 'string' },
              discovered_via: { type: 'string' },
              profile: {
                type: 'object',
                description:
                  'Complete freeform profile (occupation, company, website, phone, location, how_we_met, plus any other facts).',
              },
              identities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string', description: IDENTITY_SOURCES },
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
        source_resource_id: {
          type: 'string',
          description: 'PDF, note, or meeting resource id this extraction came from.',
        },
        source_kind: {
          type: 'string',
          description: 'document | email | meeting | web | manual',
        },
        summary: { type: 'string' },
        project_id: { type: 'string' },
      },
      required: ['people'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
