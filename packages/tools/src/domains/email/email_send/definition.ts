import type { ToolDefinition } from '../../../types.js';

export const emailSendDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'email_send',
    description:
      'Compose and send a new email on behalf of the user. Requires user approval before sending (Many). Provide to, subject and body.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address(es), comma-separated.' },
        subject: { type: 'string', description: 'Subject line.' },
        body: { type: 'string', description: 'Plain-text body.' },
        cc: { type: 'string', description: 'Cc address(es), comma-separated.' },
        bcc: { type: 'string', description: 'Bcc address(es), comma-separated.' },
      },
      required: ['to', 'body'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'email_tool' as const;
export const REQUIRES_HITL = true;
