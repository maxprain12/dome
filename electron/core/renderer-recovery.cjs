'use strict';

const RECOVERABLE = new Set(['crashed', 'oom', 'abnormal-exit', 'killed']);

/** Own delivery readiness independently of BrowserWindow/WebContents destruction. */
function trackRenderer(window, { recover = false, isShuttingDown = () => false, onFailure = () => {}, cooldownMs = 30000, delayMs = 100, now = Date.now } = {}) {
  const contents = window.webContents;
  let available = false;
  let closed = false;
  let closing = false;
  let timer;
  let lastRecovery = -Infinity;
  const alive = () => !closed && !closing && !isShuttingDown() && !window.isDestroyed() && !contents.isDestroyed();
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const retry = () => {
    if (!alive()) return false;
    cancel();
    available = false;
    lastRecovery = now();
    timer = setTimeout(() => {
      timer = undefined;
      if (!alive()) return;
      try { contents.reload(); } catch (error) { onFailure(error, retry); }
    }, delayMs);
    return true;
  };
  const ready = () => { if (alive()) available = true; };
  const navigating = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) available = false; };
  const gone = (_event, details) => {
    available = false;
    cancel();
    if (!recover || !alive() || !RECOVERABLE.has(details.reason)) return;
    if (now() - lastRecovery < cooldownMs) {
      onFailure(new Error(`Renderer recovery failed: ${details.reason} (${details.exitCode})`), retry);
      return;
    }
    retry();
  };
  const failed = (_event, code, _description, _url, mainFrame) => {
    if (mainFrame && code !== -3 && lastRecovery !== -Infinity && alive()) {
      available = false;
      onFailure(new Error(`Renderer recovery navigation failed (${code})`), retry);
    }
  };
  const close = event => {
    const wasAvailable = available;
    closing = true;
    available = false;
    cancel();
    // Another close handler can veto a normal window close.
    queueMicrotask(() => { if (!closed && event.defaultPrevented) { closing = false; available = wasAvailable; } });
  };
  const dispose = () => {
    closed = true;
    available = false;
    cancel();
    contents.removeListener('dom-ready', ready);
    contents.removeListener('did-start-navigation', navigating);
    contents.removeListener('render-process-gone', gone);
    contents.removeListener('did-fail-load', failed);
    window.removeListener('close', close);
    window.removeListener('closed', dispose);
  };
  contents.on('dom-ready', ready);
  contents.on('did-start-navigation', navigating);
  contents.on('render-process-gone', gone);
  contents.on('did-fail-load', failed);
  window.on('close', close);
  window.on('closed', dispose);
  return {
    canDeliver: () => available && alive(),
    send(channel, data) {
      if (!available || !alive()) return false;
      try { contents.send(channel, data); return true; }
      catch (error) {
        const disposed = /frame.*disposed|object.*destroyed|webcontents.*destroyed/i.test(error.message || '');
        if (disposed) available = false;
        else console.warn('[RendererDelivery] send failed', channel, error.name || 'Error');
        return false;
      }
    },
    retry,
    dispose,
  };
}

module.exports = { trackRenderer };
