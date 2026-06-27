import type { ToolDefinition } from '../../../types.js';

export const emailListFoldersDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_list_folders',
    description:
      "List mailbox folders for the user's connected email account (INBOX, Sent, Drafts, etc.). Use before email_list when the user asks about a specific folder.",
    parameters: { type: 'object', properties: {} },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
export const REQUIRES_HITL = false;
