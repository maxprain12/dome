import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { BrowserOptionsSchema, assertDomain } = require('../browser-native/options.cjs');
const { scopedPath, fileAction } = require('../browser-native/files.cjs');
const { sendKeys } = require('../browser-native/cdp.cjs');
const { trimHistory, install } = require('../browser-native/runtime-hooks.cjs');
const { schemas } = require('../browser-native/actions.cjs');

test('launch options cannot weaken the Electron sandbox; CDP is loopback only', () => {
  assert.throws(() => BrowserOptionsSchema.parse({ args: ['--no-sandbox'] }));
  assert.throws(() => BrowserOptionsSchema.parse({ backend: 'chromium', cdpUrl: 'https://example.com' }));
  assert.equal(BrowserOptionsSchema.parse({ backend: 'chromium', cdpUrl: 'http://127.0.0.1:9222' }).backend, 'chromium');
  assert.throws(() => assertDomain('https://example.com.evil.test', { allowedDomains: ['*.example.com'] }));
  assert.doesNotThrow(() => assertDomain('https://www.example.com', { allowedDomains: ['*.example.com'] }));
  assert.throws(() => assertDomain('https://www.example.com', { prohibitedDomains: ['*.example.com'] }));
});
test('file actions reject traversal and symlinks, and replace exactly one match', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dome-action-test-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(root, 'secret'), 'secret');
  await fs.symlink(path.join(root, 'secret'), path.join(workspace, 'escape'));
  const context = { workspaceCwd: workspace };
  try {
    await assert.rejects(scopedPath('../secret', context));
    await assert.rejects(fileAction('browser_write_file', { path: 'escape', text: 'changed' }, context));
    await fileAction('browser_write_file', { path: 'doc', text: 'one two one' }, context);
    await assert.rejects(fileAction('browser_replace_file', { path: 'doc', oldText: 'one', text: 'three' }, context));
    await fileAction('browser_replace_file', { path: 'doc', oldText: 'two', text: 'three' }, context);
    assert.equal((await fileAction('browser_read_file', { path: 'doc' }, context)).text, 'one three one');
    assert.equal(await fs.readFile(path.join(root, 'secret'), 'utf8'), 'secret');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('keyboard dispatch uses CDP, never foreground input', async () => {
  const calls = [];
  const contents = { debugger: { isAttached: () => true, sendCommand: async (method, args) => calls.push({ method, args }) } };
  await sendKeys(contents, 'Control+A');
  const keys = calls.filter(call => call.method === 'Input.dispatchKeyEvent');
  assert.equal(keys[0].args.modifiers, 2);
  assert.equal(keys[1].args.type, 'keyUp');
  assert.ok(calls.some(call => call.method === 'Emulation.setFocusEmulationEnabled'));
});
test('background screenshots use CDP without a native window capture', async () => {
  const { capture } = require('../browser-native/capture.cjs');
  const contents = {
    capturePage: () => { throw new Error('Native view is not attached'); },
    debugger: { isAttached: () => true, sendCommand: async name => {
      assert.equal(name, 'Page.captureScreenshot');
      return { data: Buffer.from('png fixture').toString('base64') };
    } },
  };
  const image = await capture(contents);
  assert.equal(image.toPNG().toString(), 'png fixture');
  assert.match(image.toDataURL(), /^data:image\/png;base64,/);
});
test('background tabs reuse the shell window and release their parent on close', async () => {
  const { NativeBrowserService } = require('../browser-native/service.cjs');
  const children = new Set(); let bounds; let released = 0; let closed = false;
  const window = { isDestroyed: () => false, contentView: {
    addChildView: view => children.add(view), removeChildView: view => children.delete(view),
  } };
  const browser = new NativeBrowserService({ getHostWindow: () => window });
  const view = { getBounds: () => bounds, setBounds: value => { bounds = value; }, webContents: {
    isDestroyed: () => closed, close: () => { closed = true; },
  } };
  const tab = { id: 'tab', view };
  const item = { id: 'run', options: { viewport: { width: 640, height: 480 } },
    tabs: new Map([['tab', tab]]), activeTabId: 'tab', release: () => { released++; } };
  browser.sessions.set(item.id, item);
  browser.park(item, tab);
  assert.ok(bounds.x + bounds.width < 0 && bounds.y + bounds.height < 0);
  browser.attach(item.id, window, { x: 10, y: 20, width: 640, height: 480 });
  assert.equal(children.size, 1); assert.equal(bounds.x, 10);
  browser.detach(item.id);
  assert.equal(children.size, 1); assert.ok(bounds.x < 0);
  await browser.close(item.id);
  assert.equal(children.size, 0); assert.equal(released, 1); assert.equal(closed, true);
});
test('history budget preserves whole turns and tool pairs', () => {
  const messages = [{role:'system'}, {role:'user'}, {role:'assistant'}, {role:'user'}, {role:'assistant',content:'call'}, {role:'toolResult'}];
  assert.deepEqual(trimHistory(messages, 3), [messages[0], ...messages.slice(3)]);
});
test('structured completion ends the existing loop and failure budget requests a final response', async () => {
  const hooks = new Map(); let active;
  const unsubscribe = install({ on: (name, fn) => { hooks.set(name, fn); return () => hooks.delete(name); }, setActiveTools: async names => { active = names; } }, { maxFailures: 0, finalResponseAfterFailure: true });
  assert.deepEqual(await hooks.get('tool_result')({toolName:'browser_done',isError:false}), {terminate:true});
  const result = await hooks.get('tool_result')({toolName:'browser_click',isError:true,content:[]});
  assert.deepEqual(active, []); assert.match(result.content[0].text, /failure budget/);
  unsubscribe(); assert.equal(hooks.size, 0);
});
test('element actions require observed snapshots; state uses opaque references', () => {
  assert.throws(() => schemas.browser_click.parse({ elementId:'e1' }));
  assert.throws(() => schemas.browser_import_state.parse({stateRef:'cookie contents'}));
  assert.throws(() => schemas.browser_upload_file.parse({snapshotId:'old',elementId:'e1',path:'file'}));
});
test('artifact directories reject workspace symlinks before downloads or recording create files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dome-artifact-scope-'));
  const workspace = path.join(root,'workspace'); await fs.mkdir(workspace);
  await fs.symlink(root,path.join(workspace,'.dome'));
  const {scopedOutputDirectory}=require('../browser-native/files.cjs');
  try {
    await assert.rejects(scopedOutputDirectory('.dome/browser-artifacts/run',workspace),/outside/);
    assert.equal(await scopedOutputDirectory('safe/missing/run',workspace),path.join(await fs.realpath(workspace),'safe/missing/run'));
    await assert.rejects(scopedOutputDirectory('../escape',workspace),/outside/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
