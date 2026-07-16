import type { ToolDefinition } from '../../../types.js';

export const emailReadDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_read',
    description:
      'Read the full body of one email by message id (from email_list, email_search, or a pinned email). Returns plain-text body for analysis.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description:
            'IMAP uid from email_list/email_search (`id` field), or a pinned email id. Dome cache ids (`emsg-…`) are accepted and resolved.',
        },
        folder: { type: 'string', description: 'Folder the message is in. Defaults to INBOX.' },
      },
      required: ['message_id'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
