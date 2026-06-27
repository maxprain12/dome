import type { ToolDefinition } from '../../../types.js';

export const githubCreateMilestoneDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_create_milestone',
    description:
      'Create a GitHub milestone in a synced repo. Writes to GitHub (HITL in Many). Use github_list_repos for repo_id. Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        repo_id: { type: 'string', description: 'Dome repo id from github_list_repos' },
        title: { type: 'string', description: 'Milestone title' },
        description: { type: 'string', description: 'Optional description (Markdown)' },
        due_on: { type: 'string', description: 'Optional due date ISO 8601 (e.g. 2026-12-31)' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Default open' },
      },
      required: ['repo_id', 'title'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
export const REQUIRES_HITL = true;
