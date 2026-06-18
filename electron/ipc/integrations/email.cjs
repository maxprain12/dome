/* eslint-disable no-console */
/**
 * IPC handlers for email operations (himalaya backend).
 * Secrets never cross the IPC boundary: account listings are masked.
 */
const { z } = require('zod');
const emailService = require('../../email/himalaya-service.cjs');

const AccountIdSchema = z.string().min(1);
const OptionalAccountIdSchema = z.string().min(1).nullable().optional();

const AddAccountSchema = z.object({
  email: z.string().min(1),
  display_name: z.string().optional(),
  imap_host: z.string().min(1),
  imap_port: z.number().int().positive().optional(),
  imap_encryption: z.string().optional(),
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().positive().optional(),
  smtp_encryption: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  is_default: z.boolean().optional(),
});

const ListEnvelopesSchema = z.object({
  accountId: OptionalAccountIdSchema,
  folder: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

const ReadMessageSchema = z.object({
  accountId: OptionalAccountIdSchema,
  messageId: z.string().min(1),
  folder: z.string().optional(),
});

const SearchSchema = z.object({
  accountId: OptionalAccountIdSchema,
  query: z.string().optional(),
  folder: z.string().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

const SendSchema = z.object({
  accountId: OptionalAccountIdSchema,
  to: z.string().min(1),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

const ReplySchema = z.object({
  accountId: OptionalAccountIdSchema,
  messageId: z.string().min(1),
  body: z.string().optional(),
  folder: z.string().optional(),
});

/** Build a structured failure with a localizable error code + optional help URL. */
function fail(err, extra = {}) {
  const message = err?.message || String(err);
  const errorCode = err?.errorCode || emailService.classifyEmailError(message).errorCode;
  const helpUrl = err?.helpUrl ?? emailService.classifyEmailError(message).helpUrl;
  return { success: false, error: message, errorCode, helpUrl, ...extra };
}

function register({ ipcMain, windowManager, validateSender }) {
  const guard = (event) => validateSender(event, windowManager);

  ipcMain.handle('email:listAccounts', async (event) => {
    try {
      guard(event);
      return emailService.listAccounts();
    } catch (err) {
      console.error('[Email IPC] listAccounts error:', err);
      return fail(err, { accounts: [] });
    }
  });

  ipcMain.handle('email:addAccount', async (event, input) => {
    try {
      guard(event);
      const parsed = AddAccountSchema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Invalid account data' };
      return emailService.addAccount(parsed.data);
    } catch (err) {
      console.error('[Email IPC] addAccount error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:removeAccount', async (event, accountId) => {
    try {
      guard(event);
      const parsed = AccountIdSchema.safeParse(accountId);
      if (!parsed.success) return { success: false, error: 'Invalid accountId' };
      return emailService.removeAccount(parsed.data);
    } catch (err) {
      console.error('[Email IPC] removeAccount error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:testConnection', async (event, accountId) => {
    try {
      guard(event);
      const parsed = OptionalAccountIdSchema.safeParse(accountId ?? null);
      if (!parsed.success) return { success: false, error: 'Invalid accountId' };
      return await emailService.testConnection(parsed.data ?? null);
    } catch (err) {
      console.error('[Email IPC] testConnection error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:listFolders', async (event, accountId) => {
    try {
      guard(event);
      const parsed = OptionalAccountIdSchema.safeParse(accountId ?? null);
      if (!parsed.success) return { success: false, error: 'Invalid accountId' };
      return await emailService.listFolders(parsed.data ?? null);
    } catch (err) {
      console.error('[Email IPC] listFolders error:', err);
      return fail(err, { folders: [] });
    }
  });

  ipcMain.handle('email:listEnvelopes', async (event, params) => {
    try {
      guard(event);
      const parsed = ListEnvelopesSchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params', envelopes: [] };
      const { accountId, folder, page, pageSize } = parsed.data;
      return await emailService.listEnvelopes(accountId ?? null, { folder, page, pageSize });
    } catch (err) {
      console.error('[Email IPC] listEnvelopes error:', err);
      return fail(err, { envelopes: [] });
    }
  });

  ipcMain.handle('email:read', async (event, params) => {
    try {
      guard(event);
      const parsed = ReadMessageSchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params' };
      const { accountId, messageId, folder } = parsed.data;
      return await emailService.readMessage(accountId ?? null, messageId, { folder });
    } catch (err) {
      console.error('[Email IPC] read error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:search', async (event, params) => {
    try {
      guard(event);
      const parsed = SearchSchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params', envelopes: [] };
      const { accountId, query, folder, pageSize } = parsed.data;
      return await emailService.searchEnvelopes(accountId ?? null, query || '', { folder, pageSize });
    } catch (err) {
      console.error('[Email IPC] search error:', err);
      return fail(err, { envelopes: [] });
    }
  });

  ipcMain.handle('email:send', async (event, params) => {
    try {
      guard(event);
      const parsed = SendSchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params' };
      const { accountId, to, cc, bcc, subject, body } = parsed.data;
      return await emailService.sendMessage(accountId ?? null, { to, cc, bcc, subject, body });
    } catch (err) {
      console.error('[Email IPC] send error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:reply', async (event, params) => {
    try {
      guard(event);
      const parsed = ReplySchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params' };
      const { accountId, messageId, body, folder } = parsed.data;
      return await emailService.replyMessage(accountId ?? null, messageId, { body, folder });
    } catch (err) {
      console.error('[Email IPC] reply error:', err);
      return fail(err);
    }
  });
}

module.exports = { register };
