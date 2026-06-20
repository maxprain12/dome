/**
 * Dev-only browser IPC shim.
 *
 * When the renderer runs in a plain browser tab (no Electron preload, so
 * `window.electron` is undefined), synthesize `window.electron` backed by the
 * HTTP IPC bridge (`electron/core/dev-ipc-bridge.cjs`). This lets browser-based
 * design tooling drive the app with real data.
 *
 * The whole `window.electron` surface is reconstructed with a Proxy that maps
 * the JS access path to an IPC channel joined by ':' — the exact convention the
 * preload uses (e.g. `window.electron.db.projects.getAll()` →
 * `invoke('db:projects:getAll')`). Event subscribers (`onX` / `subscribe`) are
 * no-oped (the HTTP bridge is request/response only); they return a no-op
 * unsubscribe so React cleanup never crashes.
 *
 * No-op inside Electron (preload already set `window.electron`) and only ever
 * called under `import.meta.env.DEV`.
 */

function resolveBridgeUrl(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('ipc');
    const port = fromQuery || localStorage.getItem('dome:ipcBridgePort') || '8799';
    return `http://localhost:${port}`;
  } catch {
    return 'http://localhost:8799';
  }
}

export function installBrowserIpcShim(): void {
  if (typeof window === 'undefined') return;
  // Real Electron preload present → nothing to do.
  if ((window as unknown as { electron?: unknown }).electron) return;

  const base = resolveBridgeUrl();

  const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const res = await fetch(`${base}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, args }),
    });
    const json = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
    if (!json.ok) throw new Error(json.error || `IPC bridge error (${channel})`);
    return json.result;
  };

  const isEventSubscriber = (name: string) => /^on[A-Z0-9]/.test(name) || name === 'subscribe';

  const makeProxy = (path: string[]): unknown =>
    new Proxy(function () {} as unknown as object, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') return undefined; // never look like a thenable
        if (path.length === 0) {
          if (prop === 'invoke') return (channel: string, ...args: unknown[]) => invoke(channel, ...args);
          if (prop === 'on' || prop === 'once') return () => () => {};
          if (prop === 'off' || prop === 'removeListener' || prop === 'removeAllListeners') return () => {};
          if (prop === 'send' || prop === 'sendSync') return () => {};
        }
        return makeProxy([...path, prop]);
      },
      apply(_target, _thisArg, args: unknown[]) {
        const last = path[path.length - 1] || '';
        // Event-subscription helper: return a no-op unsubscribe function.
        if (isEventSubscriber(last)) return () => {};
        return invoke(path.join(':'), ...args);
      },
    });

  (window as unknown as { electron: unknown }).electron = makeProxy([]);
  console.info(`[browser-ipc-shim] window.electron → ${base}/ipc (dev browser mode)`);
}
