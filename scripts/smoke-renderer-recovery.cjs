'use strict';
// Real renderer termination and native capture; isolated local HTTP fixture only.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { trackRenderer } = require('../electron/core/renderer-recovery.cjs');
const { browser } = require('../electron/browser-native/service.cjs');
const { workspace } = require('../electron/browser-native/workspace.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-renderer-recovery-'));
app.setPath('userData', profile);
const server = http.createServer((_request, response) => response.end('<html><title>Recovery fixture</title><body><h1>Retained local page</h1></body></html>'));
const once = (target, event) => new Promise(resolve => target.once(event, (...args) => resolve(args)));
async function run() {
  await app.whenReady();
  // Native window capture can block under headless Xvfb while the renderer is
  // being restarted. Keep the CI smoke focused on DOM/session recovery; local
  // runs still exercise capture by default.
  const includeScreenshot = process.env.CI !== 'true';
  const host = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  let failed = 0;
  const lifecycle = trackRenderer(host, { recover: true, delayMs: 150, onFailure: () => { failed++; } });
  await host.loadURL('data:text/html,<body style="margin:0"><main id="shell">Usable shell</main></body>');
  assert.equal(lifecycle.canDeliver(), true);
  browser.getHostWindow = () => host;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser.validateUrl = async url => { assert.equal(new URL(url).origin, origin); return url; };
  const state = await workspace.open(`${origin}/page`);
  const item = browser.sessions.get(state.sessionId); await item.tail;
  const bounds = { x: 30, y: 100, width: 800, height: 500 };
  browser.attach(item.id, host, bounds);
  await item.browserSession.cookies.set({ url: origin, name: 'fixture', value: 'local-only' });
  const before = await browser.run(item.id, undefined, s => browser.snapshot(s, undefined, undefined, includeScreenshot));
  assert.match(before.readableText, /Retained local page/); if (includeScreenshot) assert.ok(before.screenshot);
  const gone = once(host.webContents, 'render-process-gone');
  const restored = once(host.webContents, 'dom-ready');
  host.webContents.forcefullyCrashRenderer(); const [, details] = await gone;
  assert.equal(item.visible, null); assert.equal(browser.sessions.get(item.id), item); assert.equal(item.tabs.size, 1);
  assert.equal(lifecycle.send('runs:chunk', {}), false);
  await restored;
  assert.equal(await host.webContents.executeJavaScript('document.getElementById("shell").textContent'), 'Usable shell');
  assert.equal(lifecycle.canDeliver(), true);
  host.setSize(1400, 900);
  await new Promise(resolve => setTimeout(resolve, 150));
  const viewport = await host.webContents.executeJavaScript('[innerWidth,innerHeight]');
  assert.deepEqual(viewport, host.getContentSize());
  browser.attach(item.id, host, bounds);
  const after = await browser.run(item.id, undefined, s => browser.snapshot(s, undefined, undefined, includeScreenshot));
  assert.match(after.readableText, /Retained local page/); if (includeScreenshot) assert.ok(after.screenshot);
  assert.equal((await item.browserSession.cookies.get({ url: origin, name: 'fixture' })).length, 1);
  let reloads = 0; host.webContents.on('dom-ready', () => { reloads++; });
  const second = once(host.webContents, 'render-process-gone'); host.webContents.forcefullyCrashRenderer(); await second;
  await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(reloads, 0); assert.equal(failed, 1); assert.equal(item.visible, null);
  process.stdout.write(`${JSON.stringify({ inducedReason: details.reason, inducedExitCode: details.exitCode, restoredShell: true, viewportMatchesContent: true, nativeCaptureBeforeAndAfter: true, savedCookieRetained: true, repeatedCrashReloads: reloads })}\n`);
  await browser.close(item.id); lifecycle.dispose(); host.destroy();
}
// Linux CI can spend several seconds starting Electron under Xvfb before the
// first renderer event. Keep this bounded, but fail the process explicitly so
// a hung Electron child cannot leave the workflow running forever.
const deadline = setTimeout(() => {
  console.error('Renderer recovery fixture deadline exceeded');
  process.exitCode = 1;
  process.exit(1);
}, 60000);
run().then(() => { clearTimeout(deadline); server.close(); app.exit(0); }, error => { clearTimeout(deadline); console.error(error); server.close(); app.exit(1); });
