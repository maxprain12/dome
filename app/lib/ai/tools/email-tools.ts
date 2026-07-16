/**
 * Email Tools (himalaya backend)
 *
 * Let the agent (Many) read, search, and send the user's email.
 * Sending (email_send / email_reply) goes through human-in-the-loop approval
 * before execution — see HITL_TOOL_NAMES in electron/agents/agent-runtime.cjs.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const EmailListSchema = Type.Object({
  folder: Type.Optional(Type.String({ description: 'Mailbox/folder to list. Defaults to INBOX.' })),
  page: Type.Optional(Type.Number({ description: 'Page number (1-based). Default 1.' })),
  page_size: Type.Optional(Type.Number({ description: 'Messages per page. Default 30.' })),
});

const EmailSearchSchema = Type.Object({
  query: Type.String({
    description:
      'Search query. himalaya filter syntax, e.g. "from alice", "subject invoice", "since 2024-01-01". Plain words search broadly.',
  }),
  folder: Type.Optional(Type.String({ description: 'Folder to search in. Defaults to INBOX.' })),
});

const EmailReadSchema = Type.Object({
  message_id: Type.String({
    description:
      'IMAP uid from email_list/email_search (`id`), or a pinned email id. Dome cache ids (`emsg-…`) are accepted.',
  }),
  folder: Type.Optional(Type.String({ description: 'Folder the message is in. Defaults to INBOX.' })),
});

const EmailSendSchema = Type.Object({
  to: Type.String({ description: 'Recipient address(es), comma-separated.' }),
  subject: Type.Optional(Type.String({ description: 'Subject line.' })),
  body: Type.String({ description: 'Plain-text body of the email.' }),
  cc: Type.Optional(Type.String({ description: 'Cc address(es), comma-separated.' })),
  bcc: Type.Optional(Type.String({ description: 'Bcc address(es), comma-separated.' })),
});

const EmailReplySchema = Type.Object({
  message_id: Type.String({ description: 'ID of the message to reply to.' }),
  body: Type.String({ description: 'Plain-text reply body.' }),
  folder: Type.Optional(Type.String({ description: 'Folder the original message is in. Defaults to INBOX.' })),
});

export function createEmailListFoldersTool(): AnyAgentTool {
  return {
    label: 'List email folders',
    name: 'email_list_folders',
    description: "List mailbox folders for the user's connected email account (INBOX, Sent, Drafts, etc.).",
    parameters: Type.Object({}),
    execute: async () => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const result = await window.electron.email.listFolders();
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to list folders.' });
        return jsonResult({ status: 'success', folders: result.folders || [] });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailListTool(): AnyAgentTool {
  return {
    label: 'List emails',
    name: 'email_list',
    description:
      "List messages in a folder of the user's mailbox. Use to show the inbox or browse a folder. Returns envelopes (id, from, subject, date, flags).",
    parameters: EmailListSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const params = args as Record<string, unknown>;
        const folder = readStringParam(params, 'folder') || undefined;
        const page = typeof params.page === 'number' && params.page > 0 ? params.page : undefined;
        const pageSize = typeof params.page_size === 'number' && params.page_size > 0 ? params.page_size : undefined;

        const result = await window.electron.email.listEnvelopes({ folder, page, pageSize });
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to list emails.' });
        return jsonResult({ status: 'success', envelopes: result.envelopes || [], count: result.envelopes?.length ?? 0 });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailSearchTool(): AnyAgentTool {
  return {
    label: 'Search emails',
    name: 'email_search',
    description: "Search the user's mailbox for messages matching a query. Use when looking for specific emails.",
    parameters: EmailSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const folder = readStringParam(params, 'folder') || undefined;

        const result = await window.electron.email.search({ query, folder });
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to search emails.' });
        return jsonResult({ status: 'success', envelopes: result.envelopes || [], count: result.envelopes?.length ?? 0 });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailReadTool(): AnyAgentTool {
  return {
    label: 'Read email',
    name: 'email_read',
    description: 'Read the full content of a single email message by its id.',
    parameters: EmailReadSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const params = args as Record<string, unknown>;
        const messageId = readStringParam(params, 'message_id', { required: true });
        const folder = readStringParam(params, 'folder') || undefined;

        const result = await window.electron.email.read({ messageId, folder });
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to read email.' });
        return jsonResult({ status: 'success', message: result.message });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailSendTool(): AnyAgentTool {
  return {
    label: 'Send email',
    name: 'email_send',
    description:
      'Compose and send a new email on behalf of the user. Requires user approval before sending. Provide to, subject and body.',
    parameters: EmailSendSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const params = args as Record<string, unknown>;
        const to = readStringParam(params, 'to', { required: true });
        const subject = readStringParam(params, 'subject') || undefined;
        const body = readStringParam(params, 'body', { required: true });
        const cc = readStringParam(params, 'cc') || undefined;
        const bcc = readStringParam(params, 'bcc') || undefined;

        const result = await window.electron.email.send({ to, subject, body, cc, bcc });
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to send email.' });
        return jsonResult({ status: 'success', message: `Email sent to ${to}.` });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailReplyTool(): AnyAgentTool {
  return {
    label: 'Reply to email',
    name: 'email_reply',
    description:
      'Reply to an existing email message by id. Requires user approval before sending. The recipient, subject and threading are derived from the original message.',
    parameters: EmailReplySchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) return jsonResult({ status: 'error', error: 'Email tools require Electron environment.' });
        const params = args as Record<string, unknown>;
        const messageId = readStringParam(params, 'message_id', { required: true });
        const body = readStringParam(params, 'body', { required: true });
        const folder = readStringParam(params, 'folder') || undefined;

        const result = await window.electron.email.reply({ messageId, body, folder });
        if (!result.success) return jsonResult({ status: 'error', error: result.error || 'Failed to send reply.' });
        return jsonResult({ status: 'success', message: 'Reply sent.' });
      } catch (error) {
        return jsonResult({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export function createEmailTools(): AnyAgentTool[] {
  return [
    createEmailListFoldersTool(),
    createEmailListTool(),
    createEmailSearchTool(),
    createEmailReadTool(),
    createEmailSendTool(),
    createEmailReplyTool(),
  ];
}
