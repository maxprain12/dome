import type { ToolDefinition } from '../../../types.js';

export const githubSyncDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'github_sync',
    description: 'Trigger a full GitHub ↔ Dome sync now (push local edits, pull latest, refresh calendar). Source: GitHub.',
    parameters: { type: 'object', properties: {} },
  },
};

export const DOME_LOAD_DOC_ID = 'github_tool' as const;
