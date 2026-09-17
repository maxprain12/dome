import type { ToolDefinition } from '../../../types.js';

export const socialWatchlistsListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_watchlists_list',
    description:
      'List social watchlists (competitor, inspiration, following, custom) and their members. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
