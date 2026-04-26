/* eslint-disable no-console */
/**
 * Watch skill roots and debounce reload + broadcast.
 *
 * chokidar v5 is ESM-only, so we load it via dynamic import() from this
 * CommonJS module. The module is cached after the first load.
 */
const path = require('path');
const fs = require('fs');

let watcher = null;
let debounceTimer = null;
let chokidarPromise = null;
const DEBOUNCE_MS = 150;

function loadChokidar() {
  if (!chokidarPromise) {
    chokidarPromise = import('chokidar').then((m) => m.default ?? m);
  }
  return chokidarPromise;
}

/**
 * @param {() => void} onChange
 * @param {() => Array<{ path: string }>} getRoots
 */
function start(onChange, getRoots) {
  stop();
  const roots = getRoots().map((r) => r.path).filter((p) => p && fs.existsSync(p));
  if (roots.length === 0) {
    console.log('[Skills] Watcher: no roots to watch');
    return;
  }
  const fire = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        onChange();
      } catch (e) {
        console.warn('[Skills] Watcher onChange:', e?.message);
      }
    }, DEBOUNCE_MS);
  };
  const startToken = {};
  watcher = startToken;
  loadChokidar()
    .then((chokidar) => {
      if (watcher !== startToken) return;
      const instance = chokidar.watch(roots, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        depth: 4,
      });
      instance.on('add', fire).on('change', fire).on('unlink', fire).on('addDir', fire).on('unlinkDir', fire);
      watcher = instance;
      console.log('[Skills] Watcher started on', roots.length, 'root(s)');
    })
    .catch((e) => {
      console.warn('[Skills] Watcher failed to load chokidar:', e?.message);
      if (watcher === startToken) watcher = null;
    });
}

function stop() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    try {
      if (typeof watcher.close === 'function') watcher.close();
    } catch {
      /* ignore */
    }
    watcher = null;
  }
}

module.exports = { start, stop };
