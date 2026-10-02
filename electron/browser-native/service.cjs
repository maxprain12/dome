'use strict';

const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Slots, bounded, abortError } = require('./async.cjs');
const { assertPublicUrl } = require('../services/web/url-guard.cjs');
const { BrowserOptionsSchema, assertDomain } = require('./options.cjs');
const { bounded: wait } = require('./async.cjs');

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
      options = { ...BrowserOptionsSchema.parse(Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'partition' && key !== 'outputDirectory'))),
        partition: options.partition, outputDirectory: options.outputDirectory };
      if (options.profile && [...this.sessions.values()].some(item => item.options.profile === options.profile)) throw new Error('This browser profile is already in use');
      if (options.backend === 'chromium') {
        const backend = await require('./chromium.cjs').launch(options, this.validateUrl, signal);
        const item = { id: owner, options, tabs: new Map(), activeTabId: '', tail: Promise.resolve(), release, visible: null, ...backend };
        this.sessions.set(owner, item);
        await this.newTab(item);
        await require('./recording.cjs').startRecording(this, item, options.outputDirectory);
        return item;
      }
      const partition = options.partition || (options.profile ? `persist:dome-browser-${options.profile}` : `dome-browser-${randomUUID()}`);
      if ([...this.sessions.values()].some((item) => item.partition === partition)) throw new Error('This browser profile is already in use');
      const browserSession = electronSession.fromPartition(partition);
      browserSession.setPermissionRequestHandler((_contents, permission, callback) => callback(options.permissions.includes(permission)));
      browserSession.setPermissionCheckHandler((_contents, permission) => options.permissions.includes(permission));
      if (options.proxy) await browserSession.setProxy({ proxyRules: options.proxy });
      if (options.autoDownloadPdfs) browserSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {};
        const mime = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0] || '';
        if (/application\/pdf/i.test(mime)) headers['Content-Disposition'] = ['attachment'];
        callback({ responseHeaders: headers });
      });
      browserSession.webRequest.onBeforeRequest((details, callback) => {
        if (/^(data:|blob:)/.test(details.url)) { callback({ cancel: false }); return; }
        this.validateUrl(details.url).then(() => {
          if (['mainFrame', 'subFrame'].includes(details.resourceType)) assertDomain(details.url, options);
          callback({ cancel: false });
        }).catch(() => callback({ cancel: true }));
      });
      const item = { id: owner, partition, browserSession, options, tabs: new Map(), activeTabId: '', tail: Promise.resolve(), release, visible: null };
      item.makeView = () => new WebContentsView({ webPreferences: {
        session: browserSession, contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true, backgroundThrottling: false,
      } });
      this.sessions.set(owner, item);
      await this.newTab(item);
      item.downloads = [];
      if (options.outputDirectory) await require('node:fs/promises').mkdir(options.outputDirectory, { recursive: true });
      browserSession.on('will-download', (_event, download) => {
        if (!options.acceptDownloads || !options.outputDirectory) { download.cancel(); return; }
        const target = path.join(options.outputDirectory, `${randomUUID()}-${path.basename(download.getFilename()).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        download.setSavePath(target);
        const timeout = setTimeout(() => download.cancel(), 60000);
        download.on('updated', () => { if (download.getReceivedBytes() > 100000000) download.cancel(); });
        download.once('done', (_event, state) => {
          clearTimeout(timeout);
          if (state === 'completed') item.downloads.push({ path: target, url: download.getURL(), bytes: download.getReceivedBytes() });
        });
      });
      await require('./recording.cjs').startRecording(this, item, options.outputDirectory);
      return item;
    } catch (error) { if (this.sessions.has(owner)) this.close(owner); else release(); throw error; }
  }

  async newTab(item) {
    const view = await item.makeView();
    const id = randomUUID();
    view.setBounds({ x: 0, y: 0, ...item.options.viewport });
    if (item.options.userAgent) view.webContents.setUserAgent(item.options.userAgent);
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Keep popups inside the controlled session; never grant app IPC to them.
      void this.run(item.id, undefined, async (session) => {
        const tab = await this.newTab(session);
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
    assertDomain(target, item.options);
    const tab = this.tab(item, tabId);
    tab.initializedUrl = null;
    await bounded(tab.view.webContents.loadURL(target), signal, 30000, () => tab.view.webContents.stop());
    await require('./cdp.cjs').command(tab.view.webContents, 'Emulation.setDeviceMetricsOverride', { ...item.options.viewport, deviceScaleFactor: item.options.deviceScaleFactor, mobile: item.options.mobile }, signal);
    if (item.options.waitAfterLoadMs) await wait(new Promise((resolve) => setTimeout(resolve, item.options.waitAfterLoadMs)), signal);
    return this.snapshot(item, signal, tab.id);
  }

  async evaluate(item, expression, signal, tabId, frameId) {
    const contents = this.tab(item, tabId).view.webContents;
    if (frameId) {
      if (!item.options.crossOriginFrames) throw new Error('Frame access is not enabled');
      return (await require('./frames.cjs').evaluate(contents, frameId, expression, signal)).value;
    }
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
    if (item.options.crossOriginFrames) {
      const frames = require('./frames.cjs');
      const code = readFileSync(path.join(__dirname, '../../dist/browser-page.js'), 'utf8');
      tab.frameContexts ||= new Map();
      data.frames = [];
      for (const frame of await frames.frames(tab.view.webContents, item.options)) {
        try {
          const { contextId } = await frames.evaluate(tab.view.webContents, frame.id, 'typeof globalThis.__domePageAgent', signal);
          if (tab.frameContexts.get(frame.id) !== contextId) { await frames.evaluate(tab.view.webContents, frame.id, code, signal); tab.frameContexts.set(frame.id, contextId); }
          const capture = await frames.evaluate(tab.view.webContents, frame.id, 'globalThis.__domePageAgent.read()', signal);
          data.frames.push({ ...capture.value, frameId: frame.id, tabId: tab.id, sessionId: item.id });
        } catch { data.frames.push({ frameId: frame.id, error: 'Frame changed or unavailable' }); }
      }
    }
    if (item.options.highlightElements) await this.evaluate(item, 'globalThis.__domePageAgent.highlight?.()', signal, tab.id);
    if (item.visible && item.visible.view !== tab.view && item.activeTabId === tab.id) {
      const { window, view } = item.visible;
      this.attach(item.id, window, view.getBounds());
    }
    if (includeScreenshot && !item.hasSecrets) data.screenshot = (await bounded(tab.view.webContents.capturePage(), signal)).toDataURL();
    if (item.secrets?.size) {
      let serialized = JSON.stringify(data);
      for (const secret of item.secrets) serialized = serialized.split(JSON.stringify(secret).slice(1, -1)).join('[redacted]');
      return JSON.parse(serialized);
    }
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
    if (item.options.backend === 'chromium') throw new Error('The advanced Chromium backend uses its own local browser; choose headless=false to interact');
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
    if (item.recording) { item.recording.stopped = true; clearTimeout(item.recording.timer); }
    this.sessions.delete(owner);
    for (const tab of item.tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (item.partition && !item.options.profile && ![...this.recovery.values()].some((saved) => saved.partition === item.partition)) void item.browserSession.clearStorageData().catch(() => {});
    if (item.dispose) void item.dispose().catch(() => {});
    item.release();
  }

  async finish(owner) {
    const item = this.sessions.get(owner);
    if (!item) return [];
    try { return await require('./recording.cjs').finishRecording(item); }
    finally { if (!item.options.keepAlive) this.close(owner); }
  }
}

const browser = new NativeBrowserService();
module.exports = { NativeBrowserService, browser, WORLD };
