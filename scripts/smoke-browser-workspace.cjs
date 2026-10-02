'use strict';
// Deterministic login fixture; never accesses a real user profile or account.
const { app, BaseWindow } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.stdout.write('workspace smoke: loading browser modules\n');
const { browser } = require('../electron/browser-native/service.cjs');
const { workspace, DESKTOP_SESSION } = require('../electron/browser-native/workspace.cjs');
const { execute } = require('../electron/browser-native/actions.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-workspace-smoke-'));
app.setPath('userData', profile);
const server = http.createServer((request, response) => {
  if (request.url === '/login') {
    response.writeHead(302, { 'Set-Cookie': 'fixture_login=yes; HttpOnly; Max-Age=3600; SameSite=Lax; Path=/', Location: '/profile' }); response.end(); return;
  }
  const signedIn = (request.headers.cookie || '').includes('fixture_login=yes');
  response.end(`<html><title>Research fixture</title><body><h1>${signedIn ? 'Signed in profile: fixture researcher' : 'Sign in to view this profile'}</h1><a href="/login">Sign in</a><p>Observed local fixture</p></body></html>`);
});
async function run() {
  process.stdout.write('workspace smoke: waiting for Electron\n');
  await app.whenReady();
  process.stdout.write('workspace smoke: Electron ready\n');
  const host = new BaseWindow({ show: false, width: 1280, height: 720 });
  browser.getHostWindow = () => host;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser.validateUrl = async url => { assert.equal(new URL(url).origin, origin); return url; };
  process.stdout.write('workspace smoke: opening fixture\n');
  const first = await workspace.open(`${origin}/profile`);
  assert.equal(first.persistent, true);
  assert.equal(workspace.resolve('other-chat'), undefined);
  assert.deepEqual((await execute('browser_sessions', {}, { threadId: 'other-chat' })).sessions, []);
  // Simulate a user clicking the fixture's sign-in link inside the native page.
  await browser.run(DESKTOP_SESSION, undefined, async item => {
    const contents = browser.tab(item).view.webContents;
    const loaded = new Promise(resolve => contents.once('did-stop-loading', resolve));
    await browser.evaluate(item, 'document.querySelector("a").click()');
    await require('../electron/browser-native/async.cjs').bounded(loaded, undefined, 5000);
  });
  process.stdout.write('workspace smoke: login completed\n');
  workspace.share('fixture-chat', DESKTOP_SESSION, first.tabId);
  const read = await require('../electron/tools/tool-dispatcher.cjs').executeToolInMain('browser_read_page', {}, { threadId: 'fixture-chat', agentMode: 'agent' });
  assert.match(read.details.data.readableText, /Signed in profile: fixture researcher/);
  assert.equal(await browser.evaluate(browser.sessions.get(DESKTOP_SESSION), 'typeof window.electron'), 'undefined');
  const second = await workspace.open(`${origin}/other-profile`);
  await assert.rejects(execute('browser_read_page', { tabId: second.tabId }, { threadId: 'fixture-chat' }), /not been shared/);
  const tabs = await execute('browser_tabs', {}, { threadId: 'fixture-chat' });
  assert.equal(tabs.data.tabs.length, 1);
  await assert.rejects(execute('browser_export_state', {}, { threadId: 'fixture-chat' }), /disabled/);
  await browser.finish(DESKTOP_SESSION);
  assert.ok(browser.sessions.has(DESKTOP_SESSION), 'A completed agent run must not discard the user session');
  await browser.sessions.get(DESKTOP_SESSION).browserSession.cookies.flushStore();
  await browser.close(DESKTOP_SESSION);
  assert.equal(workspace.resolve('fixture-chat'), undefined);
  const reopened = await workspace.open(`${origin}/profile`);
  await browser.sessions.get(DESKTOP_SESSION).tail;
  const snapshot = await browser.snapshot(browser.sessions.get(DESKTOP_SESSION));
  assert.match(snapshot.readableText, /Signed in profile: fixture researcher/);
  assert.ok(reopened.persistent);
  await browser.close(DESKTOP_SESSION);
  assert.equal(browser.slots.active, 0);
  host.destroy();
  process.stdout.write('Browser workspace fixture passed: login, saved cookies, agent read, chat isolation, persistence and cleanup\n');
}
run().then(() => { server.close(); app.exit(0); }, error => { console.error(error); server.close(); app.exit(1); });
