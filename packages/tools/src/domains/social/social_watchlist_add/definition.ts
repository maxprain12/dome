import type { ToolDefinition } from '../../../types.js';

export const socialWatchlistAddDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_watchlist_add',
    description:
      'Add a competitor, inspiration or followed profile to a social watchlist. Does not import a full following graph. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        watchlist_id: { type: 'string', description: 'Watchlist id from social_watchlists_list.' },
        kind: {
          type: 'string',
          enum: ['competitor', 'inspiration', 'following', 'custom'],
          description: 'If watchlist_id is omitted, use or create the default list of this kind.',
        },
        url: { type: 'string', description: 'Public profile URL.' },
        handle: { type: 'string', description: 'Handle without @.' },
        provider: { type: 'string', enum: ['linkedin', 'instagram', 'x'] },
        display_name: { type: 'string' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
