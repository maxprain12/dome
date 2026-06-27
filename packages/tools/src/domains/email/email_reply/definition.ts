import type { ToolDefinition } from '../../../types.js';

export const emailReplyDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_reply',
    description:
      'Reply to an existing email by message id. Requires user approval before sending (Many). Recipient and subject are derived from the original.',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Id of the message to reply to.' },
        body: { type: 'string', description: 'Plain-text reply body.' },
        folder: { type: 'string', description: 'Folder of the original message. Defaults to INBOX.' },
      },
      required: ['message_id', 'body'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
export const REQUIRES_HITL = true;
