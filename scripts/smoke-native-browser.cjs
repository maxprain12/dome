'use strict';
// Uses an isolated Electron profile and a loopback fixture, never the user's app DB.
const { app } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { NativeBrowserService } = require('../electron/browser-native/service.cjs');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-browser-smoke-'));
app.setPath('userData', profile);
const server = http.createServer((_req, response) => response.end('<html><title>Native fixture</title><body><main><h1>Native fixture</h1><p>Observed source</p><input aria-label="Query"><input type="file" aria-label="Upload"><button>Continue</button></main></body></html>'));
const service = new NativeBrowserService({ validateUrl: async (url) => {
  assert.equal(new URL(url).hostname, '127.0.0.1');
  return url;
} });
async function run() {
  process.stdout.write('smoke: waiting for Electron\n');
  await app.whenReady();
  process.stdout.write('smoke: Electron ready\n');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await service.run('fixture', undefined, async (item) => {
    process.stdout.write('smoke: session ready\n');
    const snapshot = await service.navigate(item, url);
    process.stdout.write('smoke: navigation ready\n');
    assert.equal(snapshot.title, 'Native fixture');
    assert.match(snapshot.readableText, /Observed source/);
    assert.ok(snapshot.elements.some((element) => element.label === 'Continue'));
    assert.equal(await service.evaluate(item, 'typeof require'), 'undefined');
    assert.equal(await service.evaluate(item, 'typeof window.electron'), 'undefined');
    const query = snapshot.elements.find(element => element.label === 'Query');
    const old = snapshot.snapshotId;
    const filled = await service.evaluate(item, `globalThis.__domePageAgent.act(${JSON.stringify({kind:'fill',snapshotId:old,elementId:query.id,value:'first'})})`);
    assert.equal(filled.success, true);
    await service.snapshot(item);
    const stale = await service.evaluate(item, `globalThis.__domePageAgent.act(${JSON.stringify({kind:'fill',snapshotId:old,elementId:query.id,value:'stale'})})`);
    assert.equal(stale.success, false);
    const { command, sendKeys } = require('../electron/browser-native/cdp.cjs');
    const contents = service.tab(item).view.webContents;
    const { result } = await command(contents, 'Runtime.evaluate', { expression: 'document.querySelector("input")' });
    const { nodeId } = await command(contents, 'DOM.requestNode', { objectId: result.objectId });
    await command(contents, 'DOM.focus', { nodeId });
    await command(contents, 'Runtime.evaluate', { expression: 'document.querySelector("input").focus()' });
    await sendKeys(contents, 'Primary+A');
    await command(contents, 'Input.insertText', { text: 'background keys' });
    assert.equal(await service.evaluate(item, 'document.querySelector("input").value'), 'background keys');
    const upload = path.join(profile, 'upload.txt'); fs.writeFileSync(upload, 'authorized fixture');
    const { result: uploadObject } = await command(contents, 'Runtime.evaluate', { expression: 'document.querySelector("input[type=file]")' });
    await command(contents, 'DOM.setFileInputFiles', { objectId: uploadObject.objectId, files: [upload] });
    assert.equal(await service.evaluate(item, 'document.querySelector("input[type=file]").files[0].name'), 'upload.txt');
    const other = await service.newTab(item);
    await service.navigate(item, url, undefined, other.id);
    assert.equal(item.tabs.size, 2);
    item.activeTabId = snapshot.tabId;
    const image = await service.snapshot(item, undefined, undefined, true);
    assert.match(image.screenshot, /^data:image\/png;base64,/);
  }, { recordHar: true, traces: true, record: 'gif', outputDirectory: path.join(profile, 'recording') });
  const recordings = await service.finish('fixture');
  assert.ok(recordings.some(file => file.endsWith('.har')));
  assert.ok(recordings.some(file => file.endsWith('.gif')));
  service.close('fixture');
  assert.equal(service.slots.active, 0);
  process.stdout.write('Native Chromium fixture passed: capture, isolation, screenshot, cleanup\n');
}
run().then(() => { server.close(); app.exit(0); }, (error) => { console.error(error); service.close('fixture'); server.close(); app.exit(1); });
