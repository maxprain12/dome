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
  projectId: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  user_actions: z
    .object({
      list: z.boolean().optional(),
      read: z.boolean().optional(),
      search: z.boolean().optional(),
      send: z.boolean().optional(),
      reply: z.boolean().optional(),
    })
    .optional(),
  agent_actions: z
    .object({
      list: z.boolean().optional(),
      read: z.boolean().optional(),
      search: z.boolean().optional(),
      send: z.boolean().optional(),
      reply: z.boolean().optional(),
    })
    .optional(),
});

const UpdatePermissionsSchema = z.object({
  accountId: z.string().min(1),
  user_actions: z
    .object({
      list: z.boolean().optional(),
      read: z.boolean().optional(),
      search: z.boolean().optional(),
      send: z.boolean().optional(),
      reply: z.boolean().optional(),
    })
    .optional(),
  agent_actions: z
    .object({
      list: z.boolean().optional(),
      read: z.boolean().optional(),
      search: z.boolean().optional(),
      send: z.boolean().optional(),
      reply: z.boolean().optional(),
    })
    .optional(),
});

const ListEnvelopesSchema = z.object({
  accountId: OptionalAccountIdSchema,
  projectId: z.string().min(1).optional(),
  folder: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  source: z.enum(['auto', 'cache', 'live']).optional(),
});

const ReadMessageSchema = z.object({
  accountId: OptionalAccountIdSchema,
  messageId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  folder: z.string().optional(),
});

const SearchSchema = z.object({
  accountId: OptionalAccountIdSchema,
  projectId: z.string().min(1).optional(),
  query: z.string().optional(),
  folder: z.string().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

const SendSchema = z.object({
  accountId: OptionalAccountIdSchema,
  projectId: z.string().min(1).optional(),
  to: z.string().min(1),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

const ReplySchema = z.object({
  accountId: OptionalAccountIdSchema,
  projectId: z.string().min(1).optional(),
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

  ipcMain.handle('email:listAccounts', async (event, params) => {
    try {
      guard(event);
      const projectId = params && typeof params === 'object' && params.projectId ? params.projectId : null;
      return emailService.listAccounts(projectId);
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

  ipcMain.handle('email:updateAccountPermissions', async (event, input) => {
    try {
      guard(event);
      const parsed = UpdatePermissionsSchema.safeParse(input ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid permission payload' };
      const { accountId, user_actions, agent_actions } = parsed.data;
      return emailService.updateAccountPermissions(accountId, { user_actions, agent_actions });
    } catch (err) {
      console.error('[Email IPC] updateAccountPermissions error:', err);
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

  ipcMain.handle('email:listFolders', async (event, params) => {
    try {
      guard(event);
      const accountId = params && typeof params === 'object' ? params.accountId ?? null : params ?? null;
      const projectId = params && typeof params === 'object' ? params.projectId ?? null : null;
      const parsed = OptionalAccountIdSchema.safeParse(accountId ?? null);
      if (!parsed.success) return { success: false, error: 'Invalid accountId' };
      return await emailService.listFolders(parsed.data ?? null, projectId);
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
      const { accountId, folder, page, pageSize, projectId, source } = parsed.data;
      return await emailService.listEnvelopes(accountId ?? null, {
        folder,
        page,
        pageSize,
        projectId,
        source: source ?? 'auto',
      });
    } catch (err) {
      console.error('[Email IPC] listEnvelopes error:', err);
      return fail(err, { envelopes: [] });
    }
  });

  ipcMain.handle('email:sync:now', async (event, params) => {
    try {
      guard(event);
      const syncService = require('../../email/email-sync-service.cjs');
      return await syncService.syncNow({
        accountId: params?.accountId ?? null,
        projectId: params?.projectId ?? null,
      });
    } catch (err) {
      console.error('[Email IPC] sync:now error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:sync:status', (event, params) => {
    try {
      guard(event);
      const syncService = require('../../email/email-sync-service.cjs');
      const emailStore = require('../../email/email-store.cjs');
      const accountId = params?.accountId ?? null;
      return {
        success: true,
        data: {
          ...syncService.getStatus(),
          folders: accountId ? emailStore.getSyncStatus(accountId) : [],
        },
      };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('email:read', async (event, params) => {
    try {
      guard(event);
      const parsed = ReadMessageSchema.safeParse(params ?? {});
      if (!parsed.success) return { success: false, error: 'Invalid params' };
      const { accountId, messageId, folder, projectId } = parsed.data;
      return await emailService.readMessage(accountId ?? null, messageId, { folder, projectId });
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
      const { accountId, query, folder, pageSize, projectId } = parsed.data;
      return await emailService.searchEnvelopes(accountId ?? null, query || '', { folder, pageSize, projectId });
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
      const { accountId, to, cc, bcc, subject, body, projectId } = parsed.data;
      return await emailService.sendMessage(accountId ?? null, { to, cc, bcc, subject, body, projectId });
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
      const { accountId, messageId, body, folder, projectId } = parsed.data;
      return await emailService.replyMessage(accountId ?? null, messageId, { body, folder, projectId });
    } catch (err) {
      console.error('[Email IPC] reply error:', err);
      return fail(err);
    }
  });
}

module.exports = { register };
