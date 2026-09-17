import type { ToolDefinition } from '../../../types.js';

export const socialTrendsSnapshotDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_trends_snapshot',
    description:
      'Derive trend signals from your published posts and saved references for a 7/30/90 day window. Every signal has provenance. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        window_days: { type: 'number', description: 'Lookback window: 7, 30 or 90 (default 30).' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
