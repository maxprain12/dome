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
    const reply = (await browser.tabs.sendMessage(tabId, { type: 'DOME_PING' })) as { ok?: boolean };
    return reply?.ok === true;
  } catch {
    return false;
  }
}

async function sendOrInject(tabId: number, message: { type: string; text?: string }) {
  const alive = await ping(tabId);
  if (!alive) {
    await injectPanel(tabId);
    if (message.type === 'DOME_TOGGLE') return;
  }
  await browser.tabs.sendMessage(tabId, message);
}

function setupContextMenu() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: 'dome-add-selection',
      title: browser.i18n.getMessage('addSelection') || 'Add selection to Dome note',
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
    if (typeof tab.id !== 'number' || !isHttpTab(tab)) return;
    sendOrInject(tab.id, { type: 'DOME_TOGGLE' }).catch(() => undefined);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'dome-add-selection' || typeof tab?.id !== 'number' || !isHttpTab(tab)) return;
    const text = String(info.selectionText || '').trim();
    if (!text) return;
    sendOrInject(tab.id, { type: 'DOME_ADD_SELECTION', text }).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message: { type?: string; path?: string; method?: string; body?: unknown; token?: string | null }) => {
    if (message?.type !== 'DOME_HTTP' || typeof message.path !== 'string') return;
    return request({
      path: message.path,
      method: message.method,
      body: message.body,
      token: message.token,
    });
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'dome-ai') return;
    port.onMessage.addListener((msg: { token?: string; body?: ManyStreamBody }) => {
      const token = msg.token;
      const body = msg.body;
      if (!token || !body) {
        port.postMessage({ type: 'error', error: 'Invalid Many request' });
        return;
      }
      const streamId = body.streamId || `ext_${Date.now()}`;
      streamManyHttp(token, { ...body, streamId }, (event) => {
        try {
          port.postMessage(event);
        } catch {
          cancelMany(token, streamId).catch(() => undefined);
        }
      })
        .then((result) => {
          if (!result.success) port.postMessage({ type: 'error', error: result.error });
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
    });
  });
});
