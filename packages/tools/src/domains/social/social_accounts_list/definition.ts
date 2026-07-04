import type { ToolDefinition } from '../../../types.js';

export const socialAccountsListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_accounts_list',
    description:
      'List the connected social accounts (LinkedIn / Instagram / X) with handle and connection status. ' +
      'Call before drafting posts to know which networks are available. Source: Social hub.',
    parameters: { type: 'object', properties: {} },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;
