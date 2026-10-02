'use strict';
const { chromium } = require('playwright-core');
const { EventEmitter } = require('node:events');
const { bounded } = require('./async.cjs');
const { assertDomain } = require('./options.cjs');

async function launch(options, validateUrl, signal) {
  let browser;
  let owned = true;
  const proxy = options.proxy ? { server: options.proxy } : undefined;
  if (options.cdpUrl) {
    browser = await bounded(chromium.connectOverCDP(options.cdpUrl), signal);
    owned = false;
  } else {
    if (!options.executablePath && !options.channel) throw new Error('Choose an installed Chromium executable or channel; Dome does not download browsers');
    browser = await bounded(chromium.launch({ executablePath: options.executablePath, channel: options.channel,
      headless: options.headless, args: options.args, env: options.env, devtools: options.devtools, ignoreDefaultArgs: options.ignoreDefaultArgs,
      chromiumSandbox: true, proxy }), signal);
  }
  let storageState;
  let stateFile;
  const secrets = require('../core/secret-storage.cjs');
  const fs = require('node:fs/promises');
  if (options.profile) {
    if (!secrets.isEncryptionAvailable()) throw new Error('Secure profile storage is unavailable');
    stateFile = require('node:path').join(require('electron').app.getPath('userData'), 'browser-profiles', options.profile);
    try { storageState = JSON.parse(secrets.decryptSecret(await fs.readFile(stateFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const context = await browser.newContext({ storageState, permissions: options.permissions.flatMap(permission => permission === 'media' ? ['camera', 'microphone'] : [permission]), viewport: options.viewport, deviceScaleFactor: options.deviceScaleFactor,
    userAgent: options.userAgent, isMobile: options.mobile, acceptDownloads: options.acceptDownloads });
  await context.route('**/*', async (route) => {
    try { const url = route.request().url(); if (!/^(data:|blob:)/.test(url)) await validateUrl(url); if (route.request().isNavigationRequest()) assertDomain(url, options); await route.continue(); }
    catch { await route.abort('blockedbyclient'); }
  });
  const cookies = {
    get: () => context.cookies(),
    set: (cookie) => context.addCookies([{ name: cookie.name, value: cookie.value, url: cookie.url, expires: cookie.expirationDate || cookie.expires,
      httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: { lax: 'Lax', strict: 'Strict', no_restriction: 'None' }[cookie.sameSite] || cookie.sameSite }]),
  };
  const downloads = [];
  async function makeView() {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    page.on('download', async download => {
      if (!options.outputDirectory || !options.acceptDownloads) { await download.cancel(); return; }
      const fs = require('node:fs/promises');
      const path = require('node:path');
      await fs.mkdir(options.outputDirectory, { recursive: true });
      const target = path.join(options.outputDirectory, `${require('node:crypto').randomUUID()}-${path.basename(download.suggestedFilename()).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      try { await bounded(download.saveAs(target), undefined, 60000, () => { void download.cancel(); });
        const { size } = await fs.stat(target);
        if (size > 100000000) { await fs.unlink(target); return; }
        downloads.push({ path: target, url: download.url(), bytes: size });
      } catch { await download.cancel(); }
    });
    const debug = new EventEmitter();
    debug.isAttached = () => true;
    debug.attach = () => {};
    debug.sendCommand = (name, params) => cdp.send(name, params);
    for (const event of ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished']) cdp.on(event, (params) => debug.emit('message', {}, event, params));
    let contextId;
    page.on('framenavigated', () => { contextId = undefined; });
    const history = [];
    let historyIndex = -1;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame() && history[historyIndex] !== page.url()) { history.splice(historyIndex + 1); history.push(page.url()); historyIndex++; } });
    let title = '';
    const contents = {
      debugger: debug,
      isDestroyed: () => page.isClosed(),
      async loadURL(url) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); title = await page.title(); },
      async executeJavaScriptInIsolatedWorld(_world, scripts) {
        if (!contextId) {
          const { frameTree } = await cdp.send('Page.getFrameTree');
          contextId = (await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'dome-agent' })).executionContextId;
        }
        const response = await cdp.send('Runtime.evaluate', { expression: scripts.map(script => script.code).join('\n'), contextId, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
        return response.result.value;
      },
      getURL: () => page.url(), getTitle: () => title,
      stop: () => { void cdp.send('Page.stopLoading').catch(() => {}); },
      close: () => { void page.close().catch(() => {}); },
      async capturePage() { const bytes = await page.screenshot({ type: 'png' }); return { toDataURL: () => `data:image/png;base64,${bytes.toString('base64')}`, toPNG: () => bytes }; },
      setWindowOpenHandler: () => {},
      navigationHistory: { canGoBack: () => historyIndex > 0, goBack: () => { historyIndex--; void page.goBack(); } },
      setUserAgent: () => {},
    };
    return { webContents: contents, setBounds: (bounds) => { void page.setViewportSize({ width: bounds.width, height: bounds.height }).catch(() => {}); } };
  }
  return { makeView, downloads, browserSession: { cookies, clearStorageData: () => context.clearCookies() },
    async dispose() {
      try { if (stateFile) {
        await fs.mkdir(require('node:path').dirname(stateFile), { recursive: true, mode: 0o700 });
        await fs.writeFile(stateFile, secrets.encryptSecret(JSON.stringify(await context.storageState())), { mode: 0o600 });
      } } finally { await context.close(); if (owned) await browser.close(); }
    } };
}
module.exports = { launch };
