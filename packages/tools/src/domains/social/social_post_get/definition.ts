import type { ToolDefinition } from '../../../types.js';

export const socialPostGetDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_post_get',
    description:
      'Get one social post by id (sp-…). Use when Source / mentioned-sources lists a social_post id, ' +
      'or the user refers to a pinned post. Returns body, provider, status, campaign, media and metrics. ' +
      'Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        post_id: {
          type: 'string',
          description: 'Social post id (e.g. sp-… from mentioned-sources or social_posts_list).',
        },
      },
      required: ['post_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
