import type { ToolDefinition } from '../../../types.js';

export const githubGetIssueDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_get_issue',
    description:
      'Get one GitHub issue by Dome issue id (ghi-…). Use when mentioned-sources lists an issue ' +
      'or the user refers to a pinned task. Returns title, body, state, labels, assignees, url. Source: GitHub.',
    parameters: {
      type: 'object',
      properties: {
        issue_id: {
          type: 'string',
          description: 'Dome issue id from mentioned-sources or github_list_issues (e.g. ghi-…).',
        },
      },
      required: ['issue_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
