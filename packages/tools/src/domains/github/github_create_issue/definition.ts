import type { ToolDefinition } from '../../../types.js';

export const githubCreateIssueDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_create_issue',
    description: 'Create a new GitHub issue in a synced repo. Writes to GitHub (HITL in Many). Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        repo_id: { type: 'string', description: 'Dome repo id from github_list_repos' },
        title: { type: 'string', description: 'Issue title' },
        body: {
          type: 'string',
          description: 'Issue body (Markdown). Add a "due:YYYY-MM-DD" line to project it onto the calendar.',
        },
        milestone_number: { type: 'number', description: 'Optional milestone number to assign' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub logins to assign (from mentioned-people github identities; no @ prefix)',
        },
      },
      required: ['repo_id', 'title'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
export const REQUIRES_HITL = true;
