/* eslint-disable no-console */
/**
 * Dev-only IPC bridge over plain HTTP.
 *
 * Lets the renderer run in a normal browser tab (http://localhost:5173) yet
 * still reach the real `ipcMain` handlers, so browser-based design tooling can
 * drive the app with real data. Request/response only (matches `invoke`);
 * main→renderer push events are NOT bridged (the browser shim no-ops them).
 *
 * NEVER enabled in packaged builds (the caller gates on dev). Binds to
 * 127.0.0.1 only. Pairs with `app/lib/dev/browserIpcShim.ts`.
 */
const http = require('http');

/** channel → handler fn, captured from ipcMain.handle. */
const handlers = new Map();
let patched = false;
let server = null;

const DEFAULT_PORT = Number(process.env.DOME_IPC_BRIDGE_PORT || 8799);

/**
 * Patch `ipcMain.handle` so every registered handler is also recorded here.
 * MUST run before IPC handlers are registered (i.e. before `registerAll`).
 * Idempotent.
 */
function installIpcCapture() {
  if (patched) return;
  const { ipcMain } = require('electron');
  patched = true;

  const origHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) => {
    handlers.set(channel, fn);
    return origHandle(channel, fn);
  };

  if (typeof ipcMain.removeHandler === 'function') {
    const origRemove = ipcMain.removeHandler.bind(ipcMain);
    ipcMain.removeHandler = (channel) => {
      handlers.delete(channel);
      return origRemove(channel);
    };
  }
}

function sendJson(res, status, body) {
  let payload;
  try {
    payload = JSON.stringify(body);
  } catch {
    payload = JSON.stringify({ ok: false, error: 'Result is not JSON-serializable' });
    status = 200;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Dev-only, localhost: allow the Vite-served renderer to call cross-origin.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

/**
 * Start the HTTP bridge.
 * @param {object} opts
 * @param {() => (Electron.WebContents | undefined)} opts.getSender authorized sender for validateSender()
 * @param {number} [opts.port]
 */
function startDevIpcBridge({ getSender, port = DEFAULT_PORT } = {}) {
  if (server) return server;

  server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method !== 'POST' || !req.url || !req.url.startsWith('/ipc')) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024 * 1024) req.destroy(); // guard against runaway bodies
    });
    req.on('end', async () => {
      let channel;
      let args;
      try {
        const body = JSON.parse(raw || '{}');
        channel = body.channel;
        args = Array.isArray(body.args) ? body.args : [];
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }

      const fn = handlers.get(channel);
      if (typeof fn !== 'function') {
        sendJson(res, 404, { ok: false, error: `No handler for channel: ${channel}` });
        return;
      }

      // Fake IpcMainInvokeEvent. `sender` is the authorized main window so
      // validateSender(event, windowManager) passes.
      const sender = getSender && getSender();
      const fakeEvent = { sender, senderFrame: null, frameId: 0, processId: 0, ports: [] };

      try {
        const result = await fn(fakeEvent, ...args);
        sendJson(res, 200, { ok: true, result });
      } catch (err) {
        sendJson(res, 200, { ok: false, error: (err && err.message) || String(err) });
      }
    });
  });

  server.on('error', (err) => {
    console.warn(`[DevIpcBridge] server error: ${err && err.message}`);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(
      `[DevIpcBridge] ⚡ IPC bridge on http://localhost:${port}/ipc — open http://localhost:5173 in a browser for design tooling`,
    );
  });

  return server;
}

function stopDevIpcBridge() {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
  }
}

module.exports = { installIpcCapture, startDevIpcBridge, stopDevIpcBridge };
