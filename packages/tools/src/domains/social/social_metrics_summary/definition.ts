import type { ToolDefinition } from '../../../types.js';

export const socialMetricsSummaryDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_metrics_summary',
    description:
      'Get the social analytics summary: per-status post counts, 30-day totals (impressions/likes/comments/shares), per-network breakdown, top performing posts and recent posts with their latest metrics. ' +
      'Use this to analyse what content works, spot patterns by topic/campaign/hour, and ground recommendations. Optionally refresh metrics from the networks first. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        refresh: { type: 'boolean', description: 'Fetch fresh metrics from the networks before summarising (slower; default false).' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
