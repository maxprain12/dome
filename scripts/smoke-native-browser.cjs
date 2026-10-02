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
const server = http.createServer((_req, response) => response.end('<html><title>Native fixture</title><body><main><h1>Native fixture</h1><p>Observed source</p><input aria-label="Query"><button>Continue</button></main></body></html>'));
const service = new NativeBrowserService({ validateUrl: async (url) => {
  assert.equal(new URL(url).hostname, '127.0.0.1');
  return url;
} });
async function run() {
  await app.whenReady();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await service.run('fixture', undefined, async (item) => {
    const snapshot = await service.navigate(item, url);
    assert.equal(snapshot.title, 'Native fixture');
    assert.match(snapshot.readableText, /Observed source/);
    assert.ok(snapshot.elements.some((element) => element.label === 'Continue'));
    assert.equal(await service.evaluate(item, 'typeof require'), 'undefined');
    assert.equal(await service.evaluate(item, 'typeof window.electron'), 'undefined');
    const image = await service.snapshot(item, undefined, undefined, true);
    assert.match(image.screenshot, /^data:image\/png;base64,/);
  });
  service.close('fixture');
  assert.equal(service.slots.active, 0);
  process.stdout.write('Native Chromium fixture passed: capture, isolation, screenshot, cleanup\n');
}
run().then(() => { server.close(); app.exit(0); }, (error) => { console.error(error); service.close('fixture'); server.close(); app.exit(1); });
