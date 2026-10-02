import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BrowserWorkspace } = require('../browser-native/workspace.cjs');
const { NativeBrowserService } = require('../browser-native/service.cjs');
function fixture() {
  let url = 'about:blank';
  let release;
  const navigation = new Promise(resolve => { release = resolve; });
  const tab = { id: 'tab', view: { webContents: { getURL: () => url, getTitle: () => 'Fixture', stop: () => {}, isLoadingMainFrame: () => false, navigationHistory: { canGoBack: () => false, canGoForward: () => false } } } };
  const item = { id: 'desktop:research', activeTabId: tab.id, options: { profile: 'research' }, tabs: new Map([[tab.id, tab]]), tail: Promise.resolve() };
  const browser = { sessions: new Map([[item.id, item]]), validateUrl: async value => { if (value.includes('blocked')) throw new Error('URL blocked'); return value; }, tab: () => tab,
    run: (_id, _signal, operation) => { item.tail = item.tail.then(async () => { item.busy = true; try { return await operation(item); } finally { item.busy = false; } }); return item.tail; },
    navigate: async (_item, target, signal) => { await Promise.race([navigation, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }))]); url = target; },
  };
  return { workspace: new BrowserWorkspace(browser), item, release, browser };
}
test('opening publishes the intended page before navigation, coalesces five clicks and clears loading', async () => {
  const { workspace, item, release } = fixture();
  let events = 0; workspace.onChanged = () => events++;
  const opened = await Promise.all(Array.from({ length: 5 }, () => workspace.open('https://example.org/profile')));
  assert.ok(opened.every(state => state.loading && state.url === 'https://example.org/profile'));
  assert.equal(item.tabs.size, 1);
  release(); await item.tail;
  assert.equal(workspace.state(item.id).loading, false);
  assert.equal(workspace.state(item.id).busy, false);
  assert.ok(events >= 2);
});
test('blocked URLs allocate nothing and cancellation clears loading', async () => {
  const { workspace, item } = fixture();
  await assert.rejects(workspace.open('https://blocked.test'), /URL blocked/);
  const controller = new AbortController();
  await workspace.open('https://example.org/profile', controller.signal);
  controller.abort(); await item.tail.catch(() => {});
  assert.equal(workspace.state(item.id).loading, false);
  assert.equal(workspace.state(item.id).busy, false);
  assert.equal(workspace.state(item.id).error, 'Cancelled');
});
test('Stop cancels an address-bar navigation without waiting for the queue', async () => {
  const { workspace, item } = fixture();
  const navigating = workspace.control({ sessionId: item.id, action: 'navigate', url: 'https://example.org/profile' });
  await Promise.resolve();
  await workspace.control({ sessionId: item.id, action: 'stop' });
  await navigating;
  assert.equal(workspace.state(item.id).busy, false);
  assert.equal(workspace.state(item.id).error, undefined);
});
test('repeated attach is a no-op; resizing uses the existing view and one metrics update', () => {
  const service = new NativeBrowserService();
  let bounds = { x: 0, y: 0, width: 640, height: 480 };
  let add = 0, remove = 0, metrics = 0;
  const view = { getBounds: () => bounds, setBounds: value => { bounds = value; }, webContents: { isDestroyed: () => false } };
  const window = { isDestroyed: () => false, contentView: { addChildView: () => add++, removeChildView: () => remove++ } };
  const tab = { id: 'tab', view, ready: true, hostWindow: window };
  const item = { id: 'session', options: {}, tabs: new Map([[tab.id, tab]]), activeTabId: tab.id, visible: { view, window } };
  service.sessions.set(item.id, item); service.resizeViewport = () => metrics++;
  for (let index = 0; index < 50; index++) service.attach(item.id, window, bounds);
  assert.deepEqual([add, remove, metrics], [0, 0, 0]);
  service.attach(item.id, window, { ...bounds, width: 800 });
  assert.deepEqual([add, remove, metrics], [0, 0, 1]);
  tab.ready = false;
  service.attach(item.id, window, { ...bounds, width: 900 });
  assert.deepEqual([add, remove, metrics], [0, 0, 1], 'unloaded views must never attach CDP');
});
test('idle saved pages hide, but visible and agent-active pages remain awake', () => {
  const service = new NativeBrowserService(); let visible, throttled;
  const view = { setVisible: value => { visible = value; }, webContents: { isDestroyed: () => false, setBackgroundThrottling: value => { throttled = value; } } };
  const item = { options: { profile: 'research' }, tabs: new Map([['tab', { view }]]) };
  service.updateThrottling(item); assert.deepEqual([visible, throttled], [false, true]);
  item.busy = true; service.updateThrottling(item); assert.deepEqual([visible, throttled], [true, false]);
  item.busy = false; item.visible = { view }; service.updateThrottling(item); assert.deepEqual([visible, throttled], [true, false]);
});
