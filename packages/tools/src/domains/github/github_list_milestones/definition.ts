import type { ToolDefinition } from '../../../types.js';

export const githubListMilestonesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_list_milestones',
    description:
      'List GitHub milestones for a synced repo (title, due date, state, progress). Use github_list_repos first to get the repo_id. Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        repo_id: { type: 'string', description: 'Dome repo id (e.g. ghr-12345) from github_list_repos' },
      },
      required: ['repo_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
