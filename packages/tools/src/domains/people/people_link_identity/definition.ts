import type { ToolDefinition } from '../../../types.js';

export const peopleLinkIdentityDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'people_link_identity',
    description:
      'Link an identity (Instagram IGSID/username, email, github, …) to an existing person. ' +
      'Does not merge two people if the identity already belongs to another. Source: People.',
    parameters: {
      type: 'object',
      properties: {
        person_id: { type: 'string', description: 'Target person id.' },
        source: {
          type: 'string',
          description: 'github | email | social_x | social_linkedin | social_instagram | manual',
        },
        external_id: { type: 'string', description: 'Stable external id (IGSID, email, login).' },
        display_label: { type: 'string', description: 'Optional display label (@handle).' },
        project_id: { type: 'string', description: 'Optional project id.' },
      },
      required: ['person_id', 'source', 'external_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'entity_rules' as const;
