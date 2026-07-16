import type { ToolDefinition } from '../../../types.js';

export const socialGrowthDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_growth',
    description:
      'Follower growth series and deltas per connected account. LinkedIn personal profiles often have followersUnavailable=linkedin_member (API limit). Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookback window (default 90).' },
        refresh: { type: 'boolean', description: 'Refresh metrics from providers first.' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
