import type { ToolDefinition } from '../../../types.js';

export const socialPostPublishDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_post_publish',
    description:
      'Publish an existing social post (draft/scheduled/failed) to its network RIGHT NOW. ' +
      'Irreversible: the content goes live on the user\'s real account — only call when the user explicitly asked to publish. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post id from social_post_draft or social_posts_list.' },
      },
      required: ['post_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
