/**
 * @dome/tools — `email` family definitions (domains/email/*).
 */

import type { ToolDefinition } from '../types.js';
import { emailListFoldersDefinition } from '../domains/email/email_list_folders/definition.js';
import { emailListDefinition } from '../domains/email/email_list/definition.js';
import { emailSearchDefinition } from '../domains/email/email_search/definition.js';
import { emailReadDefinition } from '../domains/email/email_read/definition.js';
import { emailSendDefinition } from '../domains/email/email_send/definition.js';
import { emailReplyDefinition } from '../domains/email/email_reply/definition.js';

export const EMAIL_TOOL_NAMES = [
  'email_list_folders',
  'email_list',
  'email_search',
  'email_read',
  'email_send',
  'email_reply',
] as const;

export type EmailToolName = (typeof EMAIL_TOOL_NAMES)[number];

export function emailToolDefinitions(): ToolDefinition[] {
  return [
    emailListFoldersDefinition,
    emailListDefinition,
    emailSearchDefinition,
    emailReadDefinition,
    emailSendDefinition,
    emailReplyDefinition,
  ];
}
