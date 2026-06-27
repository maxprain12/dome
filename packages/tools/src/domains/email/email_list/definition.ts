import type { ToolDefinition } from '../../../types.js';

export const emailListDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_list',
    description:
      "You have direct access to the user's email. List messages in a folder (default INBOX). Returns envelope id, from, subject, date. Use immediately when asked to check email — never say the tool is unavailable without calling it.",
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Mailbox folder name. Defaults to INBOX.' },
        page: { type: 'number', description: 'Page number (1-based). Default 1.' },
        page_size: { type: 'number', description: 'Messages per page. Default 30.' },
      },
    },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
