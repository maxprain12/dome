import type { ToolDefinition } from '../../../types.js';

export const emailSearchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_search',
    description:
      "Search the user's mailbox for messages matching a query (from, subject, date filters, or free text). folder defaults to INBOX; when looking for outbound mail you must pass the Sent folder from email_list_folders — do not spam INBOX searches for what the user sent. Requires a connected email account in Settings → Email.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (himalaya filter syntax or plain words).',
        },
        folder: { type: 'string', description: 'Folder to search in. Defaults to INBOX.' },
        page_size: { type: 'number', description: 'Max results. Default 30.' },
      },
      required: ['query'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
