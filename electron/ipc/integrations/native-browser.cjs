'use strict';

const { z } = require('zod');
const { browser } = require('../../browser-native/service.cjs');
const { search, SearchSchema } = require('../../services/web/search-dispatcher.cjs');
const { workspace } = require('../../browser-native/workspace.cjs');

const IdSchema = z.object({ sessionId: z.string().min(1).max(200) }).strict();
const BoundsSchema = IdSchema.extend({ bounds: z.object({
  x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(10000),
}).strict() });
const RecoverySchema = z.object({ recoveryId: z.string().uuid() }).strict();
const OpenSchema = z.object({ url: z.string().url().max(8192) }).strict();
const ShareSchema = IdSchema.extend({ conversationId: z.string().min(1).max(200), tabId: z.string().uuid() });
const ConversationSchema = z.object({ conversationId: z.string().min(1).max(200) }).strict();
const StateSchema = IdSchema.extend({ conversationId: z.string().min(1).max(200).optional() });
const ControlSchema = z.discriminatedUnion('action', [
  IdSchema.extend({ action: z.literal('navigate'), url: z.string().url().max(8192) }),
  IdSchema.extend({ action: z.enum(['switch', 'close']), tabId: z.string().uuid() }),
  IdSchema.extend({ action: z.enum(['back', 'forward', 'reload', 'stop', 'new']) }),
]);

function register({ ipcMain, windowManager }) {
  browser.getHostWindow = () => windowManager.get('main');
  workspace.onOpened = data => {
    const window = windowManager.get('main');
    if (window && !window.isDestroyed()) window.webContents.send('native-browser:opened', data);
  };
  workspace.onChanged = sessionId => {
    const window = windowManager.get('main');
    if (window && !window.isDestroyed()) window.webContents.send('native-browser:changed', { sessionId });
  };
  const handler = (schema, fn) => async (event, raw) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try { return await fn(schema.parse(raw), event); }
    catch (error) { return { success: false, error: error.message }; }
  };
  ipcMain.handle('native-browser:search', handler(SearchSchema, (args) => search(args)));
  ipcMain.handle('native-browser:open', handler(OpenSchema, async ({ url }) => ({ success: true, data: await workspace.open(url) })));
  ipcMain.handle('native-browser:state', handler(StateSchema, ({ sessionId, conversationId }) => {
    const state = workspace.state(sessionId);
    return { success: true, data: { ...state, shared: workspace.resolve(conversationId)?.tabId === state.tabId } };
  }));
  ipcMain.handle('native-browser:control', handler(ControlSchema, async args => ({ success: true, data: await workspace.control(args) })));
  ipcMain.handle('native-browser:share', handler(ShareSchema, ({ conversationId, sessionId, tabId }) => ({ success: true, data: workspace.share(conversationId, sessionId, tabId) })));
  ipcMain.handle('native-browser:unshare', handler(ConversationSchema, ({ conversationId }) => { const binding = workspace.resolve(conversationId); workspace.bindings.delete(conversationId); if (binding) workspace.onChanged(binding.sessionId); return { success: true }; }));
  ipcMain.handle('native-browser:recover', handler(RecoverySchema, async ({ recoveryId }) => ({ success: true, data: await browser.recover(recoveryId) })));
  ipcMain.handle('native-browser:attach', handler(BoundsSchema, ({ sessionId, bounds }, event) => {
    const { BrowserWindow } = require('electron');
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No host window');
    const [width, height] = window.getContentSize();
    if (bounds.x + bounds.width > width + 1 || bounds.y + bounds.height > height + 1) throw new Error('Browser bounds exceed host window');
    browser.attach(sessionId, window, bounds);
    return { success: true };
  }));
  ipcMain.handle('native-browser:detach', handler(IdSchema, ({ sessionId }) => { browser.detach(sessionId); return { success: true }; }));
  ipcMain.handle('native-browser:close', handler(IdSchema, async ({ sessionId }) => { await browser.close(sessionId); return { success: true }; }));
  ipcMain.handle('native-browser:get-options', handler(z.object({}).strict(), () => {
    const options = require('../../browser-native/run-options.cjs').readOptions(require('../../core/database.cjs'));
    const { env, proxy, ...safeBrowser } = options.browser;
    return { success: true, data: { ...options, browser: safeBrowser } };
  }));
  ipcMain.handle('native-browser:set-options', handler(require('../../browser-native/run-options.cjs').schema, (options) => {
    const saved = require('../../browser-native/run-options.cjs').readOptions(require('../../core/database.cjs'));
    options.browser.env ??= saved.browser.env;
    options.browser.proxy ??= saved.browser.proxy;
    require('../../core/settings-secrets.cjs').writeSettingSecret(require('../../core/database.cjs').getQueries(), 'browser_runtime_options_token', JSON.stringify(options));
    return { success: true };
  }));
}
module.exports = { register };
