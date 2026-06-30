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

  /**
   * Namespaces where the JS path does not match the IPC channel (see preload.cjs).
   * The generic Proxy maps `artifacts.get` → `artifacts:get`, but handlers use `artifact:*`.
   */
  const namespaceOverrides: Record<string, Record<string, (...args: unknown[]) => unknown>> = {
    ai: {
      chat: (provider, messages, model) => invoke('ai:chat', { provider, messages, model }),
      stream: (provider, messages, model, streamId, tools) =>
        invoke('ai:stream', { provider, messages, model, streamId, tools }),
      streamAgent: (
        provider,
        messages,
        model,
        streamId,
        tools,
        threadId,
        skipHitl,
        mcpServerIds,
        subagentIds,
      ) =>
        invoke('ai:agent:stream', {
          provider,
          messages,
          model,
          streamId,
          tools,
          threadId,
          skipHitl,
          mcpServerIds,
          subagentIds,
        }),
      abortAgent: (streamId) => invoke('ai:agent:abort', streamId),
      resumeAgent: (opts) => invoke('ai:agent:resume', opts),
      listOpenRouterModels: (apiKey) => invoke('ai:openrouter:listModels', { apiKey }),
      listProviderModels: (params) => invoke('ai:provider:listModels', params),
      testConnection: () => invoke('ai:testConnection'),
      testWebSearch: () => invoke('ai:testWebSearch'),
      webSearch: (args) => invoke('ai:webSearch', args),
      onStreamChunk: () => () => {},
    },
    // `threads.*` channels are kebab-cased in preload.cjs (threads:get-state,
    // threads:get-history, …) but the generic Proxy would camelCase them to
    // `threads:getState`, which the bridge rejects ("No handler for channel") —
    // so chat history loaded empty in dev browser mode. Mirror preload exactly.
    threads: {
      list: (opts) => invoke('threads:list', opts ?? {}),
      getState: (threadId) => invoke('threads:get-state', { threadId }),
      getHistory: (threadId, limit) => invoke('threads:get-history', { threadId, limit }),
      delete: (threadId) => invoke('threads:delete', { threadId }),
      updateState: (threadId, values, asNode) =>
        invoke('threads:update-state', { threadId, values, asNode }),
      compact: (threadId, opts) => invoke('threads:compact', { threadId, ...((opts as object) ?? {}) }),
      navigateTree: (threadId, targetId, opts) =>
        invoke('threads:navigate-tree', { threadId, targetId, ...((opts as object) ?? {}) }),
    },
    artifacts: {
      create: (opts) => invoke('artifact:create', opts),
      get: (resourceId) => invoke('artifact:get', resourceId),
      buildDesign: (spec) => invoke('artifact:buildDesign', { spec }),
      update: (opts) => invoke('artifact:update', opts),
      delete: (resourceId) => invoke('artifact:delete', resourceId),
      list: (projectId) => invoke('artifact:list', projectId),
      export: (resourceId) => invoke('artifact:export', resourceId),
      exportHtml: (resourceId) => invoke('artifact:exportHtml', resourceId),
      import: () => invoke('artifact:import'),
      refreshLinked: (resourceId) => invoke('artifact:refresh-linked', resourceId),
      setLinkedResource: (resourceId, linkedResourceId) =>
        invoke('artifact:set-linked-resource', { resourceId, linkedResourceId }),
    },
  };

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

  const dbResourcesOverride = {
    moveToFolder: (resourceId: unknown, folderId: unknown) =>
      invoke('db:resources:moveToFolder', { resourceId, folderId }),
    moveToProject: (resourceId: unknown, projectId: unknown) =>
      invoke('db:resources:moveToProject', { resourceId, projectId }),
    ensureUrl: (payload: unknown) => invoke('db:resources:ensureUrl', payload),
    uploadFile: (filePath: unknown, projectId: unknown, type: unknown, title: unknown) =>
      invoke('db:resources:uploadFile', { filePath, projectId, type, title }),
  };

  const baseProxy = makeProxy([]) as object;

  (window as unknown as { electron: unknown }).electron = new Proxy(baseProxy, {
    get(_target, prop) {
      if (typeof prop === 'string' && namespaceOverrides[prop]) {
        return namespaceOverrides[prop];
      }
      if (prop === 'db') {
        const dbProxy = makeProxy(['db']);
        return new Proxy(dbProxy as object, {
          get(dbTarget, dbProp) {
            if (dbProp === 'resources') {
              const resourcesProxy = (dbTarget as Record<string | symbol, unknown>).resources;
              return new Proxy(resourcesProxy as object, {
                get(resTarget, resProp) {
                  if (typeof resProp === 'string' && resProp in dbResourcesOverride) {
                    return dbResourcesOverride[resProp as keyof typeof dbResourcesOverride];
                  }
                  return (resTarget as Record<string | symbol, unknown>)[resProp];
                },
              });
            }
            return (dbTarget as Record<string | symbol, unknown>)[dbProp];
          },
        });
      }
      return (baseProxy as Record<string | symbol, unknown>)[prop];
    },
  });

  console.info(`[browser-ipc-shim] window.electron → ${base}/ipc (dev browser mode)`);
}
