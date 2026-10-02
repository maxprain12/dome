'use strict';

const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Slots, bounded, abortError } = require('./async.cjs');
const { assertPublicUrl } = require('../services/web/url-guard.cjs');

const WORLD = 1011;
class NativeBrowserService {
  constructor({ electron = () => require('electron'), validateUrl = assertPublicUrl } = {}) {
    this.electron = electron;
    this.validateUrl = validateUrl;
    this.slots = new Slots(2);
    this.sessions = new Map();
    this.pending = new Map();
    this.recovery = new Map();
  }

  async create(owner, signal, options = {}) {
    if (this.sessions.has(owner)) return this.sessions.get(owner);
    if (this.pending.has(owner)) return bounded(this.pending.get(owner), signal);
    const pending = this.createSession(owner, signal, options);
    this.pending.set(owner, pending);
    try { return await pending; } finally { this.pending.delete(owner); }
  }

  async createSession(owner, signal, options) {
    const release = await this.slots.acquire(signal);
    const { app, WebContentsView, session: electronSession } = this.electron();
    try {
      await bounded(app.whenReady(), signal);
      const partition = options.partition || (options.profile ? `persist:dome-browser-${options.profile}` : `dome-browser-${randomUUID()}`);
      const browserSession = electronSession.fromPartition(partition);
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      browserSession.setPermissionCheckHandler(() => false);
      browserSession.webRequest.onBeforeRequest((details, callback) => {
        if (/^(data:|blob:)/.test(details.url)) { callback({ cancel: false }); return; }
        this.validateUrl(details.url).then(() => callback({ cancel: false }), () => callback({ cancel: true }));
      });
      const item = { id: owner, partition, browserSession, options, tabs: new Map(), activeTabId: '', tail: Promise.resolve(), release, visible: null };
      item.makeView = () => new WebContentsView({ webPreferences: {
        session: browserSession, contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true, backgroundThrottling: false,
      } });
      this.sessions.set(owner, item);
      this.newTab(item);
      return item;
    } catch (error) { release(); throw error; }
  }

  newTab(item) {
    const view = item.makeView();
    const id = randomUUID();
    view.setBounds({ x: 0, y: 0, width: 1280, height: 720 });
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Keep popups inside the controlled session; never grant app IPC to them.
      void this.run(item.id, undefined, async (session) => {
        const tab = this.newTab(session);
        await this.navigate(session, url, undefined, tab.id);
      }).catch(() => {});
      return { action: 'deny' };
    });
    const tab = { id, view, initializedUrl: null };
    item.tabs.set(id, tab);
    item.activeTabId = id;
    return tab;
  }

  tab(item, id = item.activeTabId) {
    const tab = item.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) throw new Error('Browser tab is closed');
    return tab;
  }

  async run(owner, signal, operation, options) {
    const item = await this.create(owner, signal, options);
    const result = item.tail.catch(() => {}).then(() => {
      if (signal?.aborted) throw abortError();
      return bounded(operation(item), signal, 45000, () => {
      for (const tab of item.tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.stop();
      });
    });
    item.tail = result;
    return result;
  }

  async navigate(item, url, signal, tabId) {
    const target = await bounded(this.validateUrl(url), signal);
    const tab = this.tab(item, tabId);
    tab.initializedUrl = null;
    await bounded(tab.view.webContents.loadURL(target), signal, 30000, () => tab.view.webContents.stop());
    return this.snapshot(item, signal, tab.id);
  }

  async evaluate(item, expression, signal, tabId) {
    const contents = this.tab(item, tabId).view.webContents;
    return bounded(contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: expression }]), signal);
  }

  async snapshot(item, signal, tabId, includeScreenshot = false) {
    const tab = this.tab(item, tabId);
    const url = tab.view.webContents.getURL();
    if (tab.initializedUrl !== url) {
      const code = readFileSync(path.join(__dirname, '../../dist/browser-page.js'), 'utf8');
      await this.evaluate(item, code, signal, tab.id);
      tab.initializedUrl = url;
    }
    const snapshot = await this.evaluate(item, 'globalThis.__domePageAgent.read()', signal, tab.id);
    const data = { ...snapshot, sessionId: item.id, tabId: tab.id };
    if (includeScreenshot) data.screenshot = (await bounded(tab.view.webContents.capturePage(), signal)).toDataURL();
    return data;
  }

  async scrape(request, signal) {
    const owner = `fetch:${randomUUID()}`;
    try {
      return await this.run(owner, signal, async (item) => {
        const snapshot = await this.navigate(item, request.url, signal);
        const data = await this.snapshot(item, signal, undefined, request.includeScreenshot);
        const content = request.selector
          ? await this.evaluate(item, `document.querySelector(${JSON.stringify(request.selector)})?.innerText || ''`, signal)
          : snapshot.readableText;
        return { success: true, url: data.url, title: data.title, content: String(content || '').slice(0, request.maxLength),
          metadata: { url: data.url, capturedAt: data.capturedAt }, screenshot: data.screenshot || null, screenshotFormat: 'png', provider: 'chromium' };
      });
    } finally { this.close(owner); }
  }

  rememberRecovery(item, url) {
    const id = randomUUID();
    this.recovery.set(id, { url, partition: item.partition, expires: Date.now() + 300000 });
    for (const [key, value] of this.recovery) if (value.expires < Date.now()) {
      this.recovery.delete(key);
      void this.electron().session.fromPartition(value.partition).clearStorageData().catch(() => {});
    }
    return id;
  }

  async recover(id, signal) {
    const saved = this.recovery.get(id);
    if (!saved || saved.expires < Date.now()) throw new Error('Search recovery expired; run the search again');
    const owner = `recovery:${id}`;
    return this.run(owner, signal, (item) => this.navigate(item, saved.url, signal), { partition: saved.partition });
  }

  attach(owner, window, bounds) {
    const item = this.sessions.get(owner);
    if (!item) throw new Error('Browser session no longer exists');
    this.detach(owner);
    const view = this.tab(item).view;
    window.contentView.addChildView(view);
    view.setBounds(bounds);
    item.visible = { window, view };
  }

  detach(owner) {
    const item = this.sessions.get(owner);
    if (item?.visible && !item.visible.window.isDestroyed()) item.visible.window.contentView.removeChildView(item.visible.view);
    if (item) item.visible = null;
  }

  close(owner) {
    const item = this.sessions.get(owner);
    if (!item) return;
    this.detach(owner);
    this.sessions.delete(owner);
    for (const tab of item.tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (!item.options.profile && ![...this.recovery.values()].some((saved) => saved.partition === item.partition)) void item.browserSession.clearStorageData().catch(() => {});
    item.release();
  }
}

const browser = new NativeBrowserService();
module.exports = { NativeBrowserService, browser, WORLD };
