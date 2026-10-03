import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { trackRenderer } = require('../core/renderer-recovery.cjs');
const delay = () => new Promise(resolve => setTimeout(resolve, 10));
function fixture(options = {}) {
  const contents = new EventEmitter(); let reloads = 0, sent = 0;
  contents.isDestroyed = () => false;
  contents.send = () => { sent++; };
  contents.reload = () => { reloads++; };
  const window = new EventEmitter(); window.webContents = contents; window.isDestroyed = () => false;
  const failures = [];
  const lifecycle = trackRenderer(window, { recover: true, delayMs: 1, onFailure: e => failures.push(e), ...options });
  return { contents, window, lifecycle, failures, reloads: () => reloads, sent: () => sent };
}
test('crashed exit 5 revokes delivery immediately, reloads once, then dom-ready restores it', async () => {
  const f = fixture(); f.contents.emit('dom-ready'); assert.equal(f.lifecycle.send('runs:chunk', {}), true);
  f.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 5 });
  assert.equal(f.lifecycle.send('runs:chunk', {}), false); await delay(); assert.equal(f.reloads(), 1);
  f.contents.emit('dom-ready'); assert.equal(f.lifecycle.send('runs:chunk', {}), true);
  f.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 5 });
  await delay(); assert.equal(f.reloads(), 1); assert.equal(f.failures.length, 1); f.lifecycle.dispose();
});
test('unexpected killed recovers; clean exit, shutdown and closed windows do not', async () => {
  for (const reason of ['killed', 'clean-exit']) {
    const f = fixture(); f.contents.emit('render-process-gone', {}, { reason }); await delay();
    assert.equal(f.reloads(), reason === 'killed' ? 1 : 0); f.lifecycle.dispose();
  }
  const shutdown = fixture({ isShuttingDown: () => true }); shutdown.contents.emit('render-process-gone', {}, { reason: 'crashed' }); await delay(); assert.equal(shutdown.reloads(), 0); shutdown.lifecycle.dispose();
  const closed = fixture(); closed.contents.emit('render-process-gone', {}, { reason: 'oom' }); closed.window.emit('closed'); await delay(); assert.equal(closed.reloads(), 0); assert.equal(closed.contents.listenerCount('render-process-gone'), 0);
});
test('cooldown expires, reload failure offers recovery, and subframes/aborted loads do not', async () => {
  let clock = 0; const f = fixture({ now: () => clock, cooldownMs: 30 });
  f.contents.emit('render-process-gone', {}, { reason: 'abnormal-exit' }); await delay();
  f.contents.emit('did-fail-load', {}, -3, '', '', true); f.contents.emit('did-fail-load', {}, -2, '', '', false); assert.equal(f.failures.length, 0);
  f.contents.emit('did-fail-load', {}, -2, '', '', true); assert.equal(f.failures.length, 1);
  clock = 31; f.contents.emit('render-process-gone', {}, { reason: 'crashed' }); await delay(); assert.equal(f.reloads(), 2); f.lifecycle.dispose();
});
test('disposed frame send is contained, while serialization failure does not disable healthy future delivery', () => {
  const f = fixture(); f.contents.emit('dom-ready');
  f.contents.send = () => { throw new Error('Render frame was disposed before WebFrameMain could be accessed'); };
  assert.equal(f.lifecycle.send('runs:chunk', {}), false); assert.equal(f.lifecycle.canDeliver(), false);
  f.contents.emit('dom-ready'); f.contents.send = () => { throw new Error('An object could not be cloned'); };
  assert.equal(f.lifecycle.send('runs:chunk', {}), false); assert.equal(f.lifecycle.canDeliver(), true);
  f.contents.send = () => {}; assert.equal(f.lifecycle.send('runs:chunk', {}), true); f.lifecycle.dispose();
});
test('navigation revokes main frame only; a vetoed close restores availability', async () => {
  const f = fixture(); f.contents.emit('dom-ready'); f.contents.emit('did-start-navigation', {}, '', false, false); assert.equal(f.lifecycle.canDeliver(), true);
  f.contents.emit('did-start-navigation', {}, '', true, true); assert.equal(f.lifecycle.canDeliver(), true);
  const e = { defaultPrevented: true }; f.window.emit('close', e); await Promise.resolve(); assert.equal(f.lifecycle.canDeliver(), true);
  f.contents.emit('did-start-navigation', {}, '', false, true); assert.equal(f.lifecycle.canDeliver(), false); f.lifecycle.dispose();
});
test('WindowManager broadcast still delivers to a healthy recipient after a disposed frame', () => {
  const module = { exports: {} }; const app = new EventEmitter();
  vm.runInNewContext(readFileSync(new URL('../core/window-manager.cjs', import.meta.url), 'utf8'), { module, process, require: name => name === 'electron' ? { app } : name === './runtime-env.cjs' ? {} : name === '../paths.cjs' ? { getPreloadPath: () => '' } : name === './renderer-recovery.cjs' ? { trackRenderer } : require(name), console });
  const manager = module.exports; const dead = fixture(); const healthy = fixture(); dead.contents.emit('dom-ready'); healthy.contents.emit('dom-ready');
  dead.contents.send = () => { throw new Error('Render frame was disposed'); };
  manager.windows.set('dead', dead.window); manager.windows.set('healthy', healthy.window); manager.renderers.set('dead', dead.lifecycle); manager.renderers.set('healthy', healthy.lifecycle);
  assert.equal(manager.broadcast('runs:updated', {}), true); assert.equal(healthy.sent(), 1); assert.equal(manager.send('missing', 'runs:updated', {}), false); dead.lifecycle.dispose(); healthy.lifecycle.dispose();
});
test('all four canonical native recovery locales are included in the packaged files', () => {
  const config = require('../../package.json'); assert.ok(config.build.files.includes('packages/i18n/locales/*/shell.json'));
  for (const lang of ['en', 'es', 'fr', 'pt']) {
    const copy = require(`../../packages/i18n/locales/${lang}/shell.json`).renderer_recovery;
    for (const key of ['title', 'message', 'retry', 'close']) assert.equal(typeof copy[key], 'string');
  }
});
