import type { ToolDefinition } from '../../../types.js';

export const githubListReposDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_list_repos',
    description:
      'List the synced GitHub repositories (Seguimiento). Returns repo id, full_name and whether it is selected for sync. Source: GitHub.',
    parameters: {
      type: 'object',
      properties: { selected_only: { type: 'boolean', description: 'Only repos selected for sync (default true)' } },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
