import type { ToolDefinition } from '../../../types.js';

export const socialPostsListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_posts_list',
    description:
      'List social media posts (drafts, scheduled queue, published history) with status, schedule, campaign, topics and latest metrics. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'], description: 'Filter by status (omit for all).' },
        limit: { type: 'number', description: 'Max posts (default 50).' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
