import type { ToolDefinition } from '../../../types.js';

export const githubListIssuesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_list_issues',
    description: 'List GitHub issues for a synced repo (number, title, state, milestone, labels). Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        repo_id: { type: 'string', description: 'Dome repo id from github_list_repos' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state (default all)' },
      },
      required: ['repo_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
