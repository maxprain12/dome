import type { ToolDefinition } from '../../../types.js';

export const githubUpdateIssueDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_update_issue',
    description: 'Update a GitHub issue (title, body, state open/closed, milestone). Writes to GitHub (HITL in Many). Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'Dome issue id from github_list_issues' },
        title: { type: 'string' },
        body: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed'] },
        milestone_number: { type: 'number', description: 'Milestone number, or null to clear' },
      },
      required: ['issue_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
export const REQUIRES_HITL = true;
