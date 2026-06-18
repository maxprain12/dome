/* eslint-disable no-console */
/**
 * IPC handlers for email operations (himalaya backend).
 * Secrets never cross the IPC boundary: account listings are masked.
 */
const emailService = require('../../email/himalaya-service.cjs');

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
      if (!input || typeof input !== 'object') return { success: false, error: 'Invalid account data' };
      if (!input.email || !input.imap_host || !input.smtp_host) {
        return { success: false, error: 'email, imap_host and smtp_host are required' };
      }
      return emailService.addAccount(input);
    } catch (err) {
      console.error('[Email IPC] addAccount error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:removeAccount', async (event, accountId) => {
    try {
      guard(event);
      return emailService.removeAccount(accountId);
    } catch (err) {
      console.error('[Email IPC] removeAccount error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:testConnection', async (event, accountId) => {
    try {
      guard(event);
      return await emailService.testConnection(accountId ?? null);
    } catch (err) {
      console.error('[Email IPC] testConnection error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:listFolders', async (event, accountId) => {
    try {
      guard(event);
      return await emailService.listFolders(accountId ?? null);
    } catch (err) {
      console.error('[Email IPC] listFolders error:', err);
      return fail(err, { folders: [] });
    }
  });

  ipcMain.handle('email:listEnvelopes', async (event, params) => {
    try {
      guard(event);
      const { accountId, folder, page, pageSize } = params || {};
      return await emailService.listEnvelopes(accountId ?? null, { folder, page, pageSize });
    } catch (err) {
      console.error('[Email IPC] listEnvelopes error:', err);
      return fail(err, { envelopes: [] });
    }
  });

  ipcMain.handle('email:read', async (event, params) => {
    try {
      guard(event);
      const { accountId, messageId, folder } = params || {};
      if (!messageId) return { success: false, error: 'messageId is required' };
      return await emailService.readMessage(accountId ?? null, messageId, { folder });
    } catch (err) {
      console.error('[Email IPC] read error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:search', async (event, params) => {
    try {
      guard(event);
      const { accountId, query, folder, pageSize } = params || {};
      return await emailService.searchEnvelopes(accountId ?? null, query || '', { folder, pageSize });
    } catch (err) {
      console.error('[Email IPC] search error:', err);
      return fail(err, { envelopes: [] });
    }
  });

  ipcMain.handle('email:send', async (event, params) => {
    try {
      guard(event);
      const { accountId, to, cc, bcc, subject, body } = params || {};
      return await emailService.sendMessage(accountId ?? null, { to, cc, bcc, subject, body });
    } catch (err) {
      console.error('[Email IPC] send error:', err);
      return fail(err);
    }
  });

  ipcMain.handle('email:reply', async (event, params) => {
    try {
      guard(event);
      const { accountId, messageId, body, folder } = params || {};
      if (!messageId) return { success: false, error: 'messageId is required' };
      return await emailService.replyMessage(accountId ?? null, messageId, { body, folder });
    } catch (err) {
      console.error('[Email IPC] reply error:', err);
      return fail(err);
    }
  });
}

module.exports = { register };
