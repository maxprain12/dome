import type { CloudModelCatalog, CloudProviderOption, ModelSelection } from './api';
import type { ManyEvent } from './liveRuns';
import type { DesktopHandlers, DesktopSocket, ManysTransport } from './transport';

/**
 * The cloud Manys over plain HTTP, for a browser that is signed in with a cookie session (a
 * standalone web app, no Electron). It is the counterpart of `ipcTransport`: the same
 * `/api/v1/manys` surface, called with `fetch`, `EventSource` and `WebSocket` instead of IPC.
 *
 * Server contract (everything under `${base}/api/v1/manys`):
 * - Any call: cookies are sent (`credentials: 'include'`) with the `x-manys-csrf: 1` header. A failure
 *   answers a non-2xx status with `{ "error": "<code>" }`; an empty 2xx body means `{}`.
 * - `GET /provider-keys` -> `[{ id, name }]` (saved API-key providers a worker can reach; names only).
 * - `GET /models-catalog` -> `CloudModelCatalog` (`{ dome: [...], saved: [...] }`).
 * - `PUT /:id/model` with a `ModelSelection` -> any 2xx.
 * - `GET /events?after=<sequence|latest>` as `text/event-stream`: one unnamed event per row,
 *   `id: <sequence>` and `data: {"sequence","kind","task_id","many_id","data"}`, ending after about a
 *   minute (the client reconnects from the last sequence it delivered).
 * - `GET /:id/computer/desktop` upgraded to a WebSocket: binary frames are the VNC stream, text
 *   frames are the computer's own short notices.
 */

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const REQUEST_TIMEOUT_MS = 65000;
const MAX_BODY_BYTES = 1048576;
const MAX_NOTICE_CHARS = 4096;
const MAX_BINARY_FRAME_BYTES = 16 * 1024 * 1024;
const FORWARDED = ['sequence', 'kind', 'task_id', 'many_id', 'data'] as const;
const WS_OPEN = 1;

export interface HttpTransportOptions {
  /** Origin of the server, without a trailing slash. Empty means the page's own origin. */
  base?: string;
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
  WebSocket?: typeof WebSocket;
}

/** The same mapping the desktop's main process applies: only a plain error code reaches the UI. */
function publicError(code: unknown): string {
  if (code === 'manys_unavailable') return 'service_unavailable';
  return typeof code === 'string' && /^[a-z][a-z0-9_]{0,80}$/.test(code) ? code : 'service_unavailable';
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return response.ok ? {} : { error: 'service_unavailable' };
  return JSON.parse(text) as unknown;
}

export function createHttpTransport(options: HttpTransportOptions = {}): ManysTransport {
  const base = (options.base ?? '').replace(/\/$/, '');
  const api = `${base}/api/v1/manys`;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const EventSourceImpl = options.EventSource ?? (typeof EventSource === 'undefined' ? undefined : EventSource);
  const WebSocketImpl = options.WebSocket ?? (typeof WebSocket === 'undefined' ? undefined : WebSocket);

  async function request<T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload && payload.length > MAX_BODY_BYTES) throw new Error('request_too_large');
    let response: Response;
    try {
      response = await doFetch(`${api}${path}`, {
        method,
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-manys-csrf': '1' },
        body: payload,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new Error('service_unavailable');
    }
    let data: unknown;
    try {
      data = await readBody(response);
    } catch {
      throw new Error('service_unavailable');
    }
    if (!response.ok) {
      const code = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
      throw new Error(publicError(code));
    }
    return data as T;
  }

  /** One EventSource per page, shared by every subscriber, resumed from the last sequence after a break. */
  const listeners = new Set<(event: ManyEvent) => void>();
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cursor: number | null = null;
  let backoff = MIN_BACKOFF_MS;

  const deliver = (raw: string) => {
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return; // A broken event is not worth dropping the feed.
    }
    const sequence = Number(row?.sequence);
    if (!Number.isFinite(sequence) || sequence <= (cursor ?? 0)) return;
    cursor = sequence;
    const event: Record<string, unknown> = {};
    for (const key of FORWARDED) event[key] = key === 'sequence' ? sequence : row[key];
    for (const listener of [...listeners]) {
      try {
        listener(event as unknown as ManyEvent);
      } catch {
        // One listener failing must not starve the others.
      }
    }
  };

  const disconnect = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    source?.close();
    source = null;
  };

  const connect = () => {
    timer = null;
    if (!EventSourceImpl || listeners.size === 0) return;
    const stream = new EventSourceImpl(`${api}/events?after=${cursor ?? 'latest'}`, { withCredentials: true });
    source = stream;
    let opened = false;
    stream.onopen = () => {
      opened = true;
      backoff = MIN_BACKOFF_MS;
    };
    stream.onmessage = (message) => deliver(String(message.data));
    stream.onerror = () => {
      // The provider ends each stream after about a minute. Reconnect on our own, from the last
      // sequence delivered, instead of letting the browser retry the original `after=latest`.
      stream.close();
      if (source !== stream) return;
      source = null;
      const wait = opened ? 0 : backoff;
      if (!opened) backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      timer = setTimeout(connect, wait);
    };
  };

  function subscribeEvents(onEvent: (event: ManyEvent) => void): () => void {
    listeners.add(onEvent);
    if (listeners.size === 1 && !source && !timer) connect();
    return () => {
      listeners.delete(onEvent);
      if (listeners.size === 0) {
        disconnect();
        cursor = null;
        backoff = MIN_BACKOFF_MS;
      }
    };
  }

  function openDesktop(manyId: string, handlers: DesktopHandlers): DesktopSocket {
    if (!WebSocketImpl) throw new Error('channel_unavailable');
    const url = new URL(`${api}/${manyId}/computer/desktop`, typeof location === 'undefined' ? undefined : location.href);
    url.protocol = url.protocol.replace(/^http/, 'ws');
    const ws = new WebSocketImpl(url.toString());
    ws.binaryType = 'arraybuffer';
    const socket: DesktopSocket = {
      binaryType: 'arraybuffer',
      protocol: '',
      get readyState() { return ws.readyState; },
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        if (ws.readyState === WS_OPEN) ws.send(data as ArrayBufferView<ArrayBuffer>);
      },
      close() {
        ws.close(1000);
      },
    };
    ws.onopen = () => {
      socket.onopen?.({});
      handlers.onOpen?.();
    };
    ws.onmessage = (message) => {
      const data: unknown = message.data;
      // Text is the computer's own words (the wheel was taken back); everything else is the VNC stream.
      if (typeof data === 'string') {
        if (data.length <= MAX_NOTICE_CHARS) handlers.onNotice?.(data);
      } else if (data instanceof ArrayBuffer && data.byteLength <= MAX_BINARY_FRAME_BYTES) {
        socket.onmessage?.({ data });
        handlers.onMessage?.(data);
      }
    };
    ws.onclose = (closed) => {
      const code = closed?.code ?? 1006;
      socket.onclose?.({ code });
      handlers.onClose?.(code);
    };
    ws.onerror = (error) => {
      socket.onerror?.(error);
      handlers.onError?.(error);
    };
    return socket;
  }

  return {
    request,
    async listProviders(): Promise<CloudProviderOption[]> {
      const providers = await request<CloudProviderOption[]>('/provider-keys');
      return Array.isArray(providers) ? providers : [];
    },
    async listModels(): Promise<CloudModelCatalog> {
      const catalog = await request<Partial<CloudModelCatalog>>('/models-catalog');
      return { dome: catalog.dome ?? [], saved: catalog.saved ?? [] };
    },
    async setModel(id: string, selection: ModelSelection): Promise<void> {
      await request(`/${id}/model`, 'PUT', { ...selection });
    },
    subscribeEvents,
    openDesktop,
  };
}
