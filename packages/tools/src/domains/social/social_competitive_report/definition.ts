import type { ToolDefinition } from '../../../types.js';

export const socialCompetitiveReportDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_competitive_report',
    description:
      'Compare your published posts with saved references on a watchlist. Cites sources and omits missing metrics. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        watchlist_id: { type: 'string', description: 'Optional watchlist id. Defaults to Competitors.' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
