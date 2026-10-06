import type { CloudModelCatalog, CloudProviderOption, ModelSelection } from './api';
import type { ManyEvent } from './liveRuns';
import type { DesktopHandlers, DesktopSocket, ManysTransport } from './transport';

type ChannelEvent =
  | { channelId: string; type: 'message'; data: string }
  | { channelId: string; type: 'binary'; bytes: Uint8Array }
  | { channelId: string; type: 'close'; code: number };

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const MAX_SEND_BYTES = 256 * 1024;

/** Invokes a main-process handler that answers `{ success, error?, data? }` and unwraps it. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T | undefined> {
  const result = await window.electron.invoke(channel, ...args) as { success: boolean; error?: string; data?: T };
  if (!result.success) throw new Error(result.error ?? 'service_unavailable');
  return result.data;
}

/** The person's side of the desktop, backed by the channel the main process holds. */
function openDesktop(manyId: string, handlers: DesktopHandlers): DesktopSocket {
  let channelId = '';
  let state = CONNECTING;
  let unsubscribe: (() => void) | null = null;
  let queued: Uint8Array[] = [];
  let flushing = false;
  const early: ChannelEvent[] = [];

  const socket: DesktopSocket = {
    binaryType: 'arraybuffer',
    protocol: '',
    get readyState() { return state; },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data) {
      if (state !== OPEN) return;
      const view = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
      queued.push(view.slice());
      if (flushing) return;
      flushing = true;
      // Pointer moves arrive in bursts; one message to the main process per burst, not one per move.
      queueMicrotask(() => {
        flushing = false;
        if (state !== OPEN || queued.length === 0) { queued = []; return; }
        const total = new Uint8Array(queued.reduce((sum, part) => sum + part.length, 0));
        let at = 0;
        for (const part of queued) { total.set(part, at); at += part.length; }
        queued = [];
        for (let from = 0; from < total.length; from += MAX_SEND_BYTES) {
          void window.electron.invoke('manys:channel:send', { channelId, bytes: total.slice(from, from + MAX_SEND_BYTES) });
        }
      });
    },
    close() {
      if (state === CLOSED || state === CLOSING) return;
      const wasOpen = state === OPEN;
      state = CLOSING;
      if (wasOpen) void window.electron.invoke('manys:channel:close', { channelId });
      finish(1000);
    },
  };

  const finish = (code: number) => {
    if (state === CLOSED) return;
    state = CLOSED;
    unsubscribe?.();
    unsubscribe = null;
    queued = [];
    socket.onclose?.({ code });
    handlers.onClose?.(code);
  };

  const fail = (error: unknown) => {
    socket.onerror?.(error);
    handlers.onError?.(error);
  };

  const deliver = (event: ChannelEvent) => {
    if (state === CLOSED) return;
    if (event.type === 'close') {
      finish(event.code);
    } else if (event.type === 'binary') {
      const bytes = event.bytes;
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      socket.onmessage?.({ data });
      handlers.onMessage?.(data);
    } else {
      handlers.onNotice?.(event.data);
    }
  };

  unsubscribe = window.electron.on('manys:channel:event', (event: ChannelEvent) => {
    if (!channelId) early.push(event);
    else if (event.channelId === channelId) deliver(event);
  });
  void window.electron.invoke('manys:channel:open', { manyId, channel: 'desktop' }).then((value: unknown) => {
    const result = value as { success: boolean; error?: string; data?: { channelId: string } };
    if (state !== CONNECTING) {
      // Closed while connecting: the channel that just opened has no owner.
      if (result.success && result.data) void window.electron.invoke('manys:channel:close', { channelId: result.data.channelId });
      return;
    }
    if (!result.success || !result.data) {
      fail(new Error(result.error ?? 'channel_unavailable'));
      finish(1006);
      return;
    }
    channelId = result.data.channelId;
    state = OPEN;
    socket.onopen?.({});
    handlers.onOpen?.();
    for (const event of early.splice(0)) if (event.channelId === channelId) deliver(event);
  }, () => {
    fail(new Error('channel_unavailable'));
    finish(1006);
  });
  return socket;
}

/** Desktop app: every call goes to the main process, which holds the session token. */
export const ipcTransport: ManysTransport = {
  async request<T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
    return await call<T>('manys:request', { path, method, body }) as T;
  },
  async listProviders(): Promise<CloudProviderOption[]> {
    const data = await call<{ providers: CloudProviderOption[] }>('manys:cloud-providers');
    return data?.providers ?? [];
  },
  async listModels(): Promise<CloudModelCatalog> {
    return await call<CloudModelCatalog>('manys:cloud-models') ?? { dome: [], saved: [] };
  },
  async setModel(id: string, selection: ModelSelection): Promise<void> {
    await call('manys:set-model', { id, selection });
  },
  subscribeEvents(onEvent: (event: ManyEvent) => void): () => void {
    const bridge = (window as { electron?: Window['electron'] }).electron;
    if (!bridge) return () => undefined;
    const unsubscribe = bridge.on('manys:events:event', onEvent);
    void bridge.invoke('manys:events:subscribe');
    return () => {
      unsubscribe();
      void bridge.invoke('manys:events:unsubscribe');
    };
  },
  openDesktop,
};
