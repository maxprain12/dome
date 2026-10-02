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
  constructor({ electron = () => require('electron'), validateUrl = assertPublicUrl, getHostWindow = () => undefined } = {}) {
    this.electron = electron;
    this.validateUrl = validateUrl;
    this.getHostWindow = getHostWindow;
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
    if (item.tabs.size >= 20) throw new Error('Close a browser page before opening another one');
    const view = await item.makeView();
    const id = randomUUID();
    const tab = { id, view, initializedUrl: null, hostWindow: null };
    item.tabs.set(id, tab);
    // Reloads and manual sign-in redirects can end at the same URL with a new
    // document. Invalidate injected page helpers on every document commit.
    view.webContents.on?.('did-navigate', () => { tab.initializedUrl = null; });
    view.setBounds({ x: 0, y: 0, ...item.options.viewport });
    this.park(item, tab);
    if (item.options.userAgent) view.webContents.setUserAgent(item.options.userAgent);
    await bounded(view.webContents.loadURL('about:blank'), undefined, 15000);
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Keep popups inside the controlled session; never grant app IPC to them.
      void this.run(item.id, undefined, async (session) => {
        const tab = await this.newTab(session);
        await this.navigate(session, url, undefined, tab.id);
        if (session.visible) this.attach(session.id, session.visible.window, session.visible.view.getBounds());
      }).catch(() => {});
      return { action: 'deny' };
    });
    await item.recording?.attach?.(view.webContents);
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
      item.busy = true;
      return bounded(operation(item), signal, 45000, () => {
      for (const tab of item.tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.stop();
      }).finally(() => { item.busy = false; });
    });
    item.tail = result;
    return result;
  }

  async navigate(item, url, signal, tabId) {
    const target = await bounded(this.validateUrl(url), signal);
    assertDomain(target, item.options);
    const tab = this.tab(item, tabId);
    tab.initializedUrl = null;
    const contents = tab.view.webContents;
    try {
      await bounded(contents.loadURL(target), signal, 30000, () => contents.stop());
    } catch (error) {
      if (signal?.aborted || !(error.code === 'ERR_ABORTED' || error.errno === -3)) throw error;
      // A page may replace its initial navigation with a client redirect.
      // Keep the same deadline and inspect the settled destination, never the aborted document.
      await bounded((async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
          await wait(new Promise(resolve => setTimeout(resolve, 50)), signal);
          const current = contents.getURL();
          if (current !== target && /^https?:/.test(current) && !contents.isLoadingMainFrame?.()) {
            await this.validateUrl(current); assertDomain(current, item.options); return;
          }
        }
        throw error;
      })(), signal, 5000);
    }
    const viewport = item.visible?.view === tab.view ? tab.view.getBounds() : item.options.viewport;
    await require('./cdp.cjs').command(tab.view.webContents, 'Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: item.options.deviceScaleFactor, mobile: item.options.mobile }, signal);
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
    if (includeScreenshot && !item.hasSecrets) data.screenshot = (await require('./capture.cjs').capture(tab.view.webContents, signal)).toDataURL();
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
    } finally { await this.close(owner); }
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

  recoveryPartition(urls) {
    for (const saved of this.recovery.values()) {
      if (saved.expires > Date.now() && urls.includes(saved.url)) return saved.partition;
    }
    return undefined;
  }

  attach(owner, window, bounds) {
    const item = this.sessions.get(owner);
    if (!item) throw new Error('Browser session no longer exists');
    if (item.options.backend === 'chromium') throw new Error('The advanced Chromium backend uses its own local browser; choose headless=false to interact');
    this.detach(owner);
    const tab = this.tab(item);
    this.unhost(tab);
    const view = tab.view;
    window.contentView.addChildView(view);
    tab.hostWindow = window;
    view.setBounds(bounds);
    item.visible = { window, view };
    this.resizeViewport(item, tab, bounds);
  }

  detach(owner) {
    const item = this.sessions.get(owner);
    if (item?.visible) {
      const tab = [...item.tabs.values()].find(entry => entry.view === item.visible.view);
      if (tab) { this.unhost(tab); this.park(item, tab); }
    }
    if (item) item.visible = null;
  }

  park(item, tab) {
    if (item.options.backend === 'chromium') return;
    const window = this.getHostWindow();
    if (!window || window.isDestroyed()) return;
    this.unhost(tab);
    // A window-backed compositor is required on Linux. Keep background tabs
    // outside the shell's visible area, using its existing window only.
    const { width, height } = item.options.viewport;
    tab.view.setBounds({ x: -width - 1, y: -height - 1, width, height });
    window.contentView.addChildView(tab.view);
    tab.hostWindow = window;
    // Do not attach a debugger to a newly created, unloaded WebContents.
    // Existing loaded tabs already have the CDP session used by navigation.
    if (tab.view.webContents.debugger?.isAttached()) this.resizeViewport(item, tab, { width, height });
  }

  resizeViewport(item, tab, { width, height }) {
    void require('./cdp.cjs').command(tab.view.webContents, 'Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: item.options.deviceScaleFactor || 1, mobile: !!item.options.mobile,
    }).catch(() => {});
  }

  unhost(tab) {
    if (tab.hostWindow && !tab.hostWindow.isDestroyed()) tab.hostWindow.contentView.removeChildView(tab.view);
    tab.hostWindow = null;
  }

  close(owner) {
    const item = this.sessions.get(owner);
    if (!item) return;
    this.detach(owner);
    if (item.recording) { item.recording.stopped = true; clearTimeout(item.recording.timer); }
    this.sessions.delete(owner);
    const closed = [...item.tabs.values()].map(tab => {
      this.unhost(tab);
      const { view } = tab;
      const contents = view.webContents;
      if (contents.isDestroyed()) return Promise.resolve();
      if (!contents.once) { contents.close(); return Promise.resolve(); }
      return new Promise(resolve => {
        const timer = setTimeout(resolve, 1000);
        contents.once('destroyed', () => { clearTimeout(timer); resolve(); });
        contents.close({ waitForBeforeUnload: false });
      });
    });
    item.release();
    return Promise.all(closed).then(async () => {
      if (item.partition && !item.options.profile && ![...this.recovery.values()].some(saved => saved.partition === item.partition)) await item.browserSession.clearStorageData().catch(() => {});
      if (item.dispose) await item.dispose().catch(() => {});
    });
  }

  async finish(owner) {
    const item = this.sessions.get(owner);
    if (!item) return [];
    try { return await require('./recording.cjs').finishRecording(item); }
    finally { if (!item.options.keepAlive) await this.close(owner); }
  }
}

const browser = new NativeBrowserService();
module.exports = { NativeBrowserService, browser, WORLD };
