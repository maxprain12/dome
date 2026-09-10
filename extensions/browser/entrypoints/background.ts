import { cancelMany, request, streamManyHttp } from '../src/lib/http';
import type { ManyStreamBody } from '../src/lib/http';

const CONTENT_FILE = '/content-scripts/panel.js';

function isHttpTab(tab: { url?: string } | undefined): boolean {
  const url = tab?.url || '';
  return url.startsWith('http://') || url.startsWith('https://');
}

async function injectPanel(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_FILE],
  });
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const reply = (await browser.tabs.sendMessage(tabId, {
      type: 'DOME_PING',
    })) as { ok?: boolean };
    return reply?.ok === true;
  } catch {
    return false;
  }
}

async function openSidebar(tab: { id?: number; windowId?: number }) {
  if (
    import.meta.env.BROWSER === 'chrome' ||
    import.meta.env.BROWSER === 'edge'
  ) {
    await browser.sidePanel.open({ windowId: tab.windowId! });
  } else if (import.meta.env.BROWSER === 'firefox') {
    await (
      browser as typeof browser & {
        sidebarAction: { open: () => Promise<void> };
      }
    ).sidebarAction.open();
  } else {
    await browser.storage.local.set({ 'dome.sourceTab': tab.id });
    const url = browser.runtime.getURL('/sidebar.html');
    const existing = (await browser.tabs.query({ url }))[0];
    if (existing?.id) await browser.tabs.update(existing.id, { active: true });
    else await browser.tabs.create({ url });
  }
}

async function readPage(tabId?: number, agent = false) {
  let tab = (
    await browser.tabs.query({ active: true, lastFocusedWindow: true })
  )[0];
  if (tab?.url === browser.runtime.getURL('/sidebar.html')) {
    const saved = await browser.storage.local.get('dome.sourceTab');
    if (typeof saved['dome.sourceTab'] === 'number')
      tab = await browser.tabs.get(saved['dome.sourceTab']);
  }
  if (tabId !== undefined) tab = await browser.tabs.get(tabId);
  const fallback = {
    tabId: tab?.id,
    url: tab?.url || '',
    title: tab?.title || '',
    selection: '',
    readableText: '',
    contact: null,
    headings: [],
    error: 'pageAccess',
  };
  if (!tab?.id || !isHttpTab(tab))
    return { ...fallback, error: 'unsupportedPage' };
  try {
    if (!(await ping(tab.id))) await injectPanel(tab.id);
    return {
      ...(await browser.tabs.sendMessage(tab.id, {
        type: agent ? 'DOME_AGENT_READ' : 'DOME_SNAPSHOT',
      })),
      tabId: tab.id,
    };
  } catch {
    return fallback;
  }
}

function setupContextMenu() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'dome-add-selection',
      title:
        browser.i18n.getMessage('addSelection') || 'Add selection to Dome note',
      contexts: ['selection'],
    });
  });
}

export default defineBackground(() => {
  setupContextMenu();
  browser.runtime.onInstalled.addListener(() => {
    setupContextMenu();
  });

  browser.action.onClicked.addListener((tab) => {
    openSidebar(tab).catch(() => undefined);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (
      info.menuItemId !== 'dome-add-selection' ||
      typeof tab?.id !== 'number' ||
      !isHttpTab(tab)
    )
      return;
    const text = String(info.selectionText || '').trim();
    if (!text) return;
    openSidebar(tab).catch(() => undefined);
    browser.storage.local
      .set({
        'dome.pendingQuote': {
          text,
          url: tab.url,
          title: tab.title,
          id: crypto.randomUUID(),
        },
      })
      .catch(() => undefined);
  });

  const announce = () => {
    browser.runtime
      .sendMessage({ type: 'DOME_PAGE_CHANGED' })
      .catch(() => undefined);
  };
  browser.tabs.onActivated.addListener(announce);
  browser.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === 'complete' || info.url) announce();
  });
  browser.runtime.onMessage.addListener(
    (message: {
      type?: string;
      path?: string;
      method?: string;
      body?: unknown;
      token?: string | null;
      tabId?: number;
      url?: string;
      action?: unknown;
    }) => {
      if (message.type === 'DOME_READ_PAGE') return readPage();
      if (message.type === 'DOME_AGENT_READ')
        return readPage(message.tabId, true);
      if (
        message.type === 'DOME_NAVIGATE' &&
        typeof message.tabId === 'number'
      ) {
        const url = message.url || '';
        if (!/^https?:\/\//.test(url))
          return Promise.resolve({
            success: false,
            error: 'Only web URLs are supported.',
          });
        return browser.tabs
          .update(message.tabId, { url })
          .then(() => ({ success: true, url }));
      }
      if (message.type === 'DOME_GO_BACK' && typeof message.tabId === 'number')
        return browser.tabs
          .goBack(message.tabId)
          .then(() => ({ success: true }));
      if (
        message.type === 'DOME_PAGE_ACTION' &&
        typeof message.tabId === 'number'
      ) {
        return browser.tabs
          .sendMessage(message.tabId, {
            type: 'DOME_ACT',
            url: message.url,
            action: message.action,
          })
          .catch(() => ({ ok: false }));
      }
      if (message?.type !== 'DOME_HTTP' || typeof message.path !== 'string')
        return;
      return request({
        path: message.path,
        method: message.method,
        body: message.body,
        token: message.token,
      });
    },
  );

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'dome-ai') return;
    let current: { token: string; streamId: string } | null = null;
    port.onDisconnect.addListener(() => {
      if (current)
        cancelMany(current.token, current.streamId).catch(() => undefined);
    });
    port.onMessage.addListener(
      (msg: { token?: string; body?: ManyStreamBody }) => {
        const token = msg.token;
        const body = msg.body;
        if (!token || !body) {
          port.postMessage({ type: 'error', error: 'Invalid Many request' });
          return;
        }
        const streamId = body.streamId || `ext_${Date.now()}`;
        current = { token, streamId };
        streamManyHttp(token, { ...body, streamId }, (event) => {
          try {
            port.postMessage(event);
          } catch {
            cancelMany(token, streamId).catch(() => undefined);
          }
        })
          .then((result) => {
            if (!result.success)
              port.postMessage({ type: 'error', error: result.error });
            else port.postMessage({ type: 'done' });
          })
          .catch((err: unknown) => {
            const error = err instanceof Error ? err.message : 'AI error';
            try {
              port.postMessage({ type: 'error', error });
            } catch {
              /* port closed */
            }
          });
      },
    );
  });
});
