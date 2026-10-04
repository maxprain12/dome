/** The browser's screen and the shell speak JSON frames. The whole desktop speaks VNC bytes: see `openDesktopSocket`. */
export type ComputerChannelKind = 'stream' | 'terminal';

export interface ComputerChannel {
  send(message: Record<string, unknown>): void;
  close(): void;
}
export interface ComputerChannelHandlers {
  onMessage(message: Record<string, unknown>): void;
  onClose(code: number): void;
}
type ChannelEvent =
  | { channelId: string; type: 'message'; data: string }
  | { channelId: string; type: 'binary'; bytes: Uint8Array }
  | { channelId: string; type: 'close'; code: number };

/**
 * Opens the live screen or the terminal of a Many's computer. The socket itself lives in the main
 * process, which holds the session token; this only relays JSON frames.
 */
export async function openComputerChannel(manyId: string, kind: ComputerChannelKind, handlers: ComputerChannelHandlers): Promise<ComputerChannel> {
  let channelId = '';
  let closed = false;
  // Frames can arrive before the open call has returned the id; keep them until it does.
  const early: ChannelEvent[] = [];
  const deliver = (event: ChannelEvent) => {
    if (closed) return;
    if (event.type === 'close') {
      closed = true;
      handlers.onClose(event.code);
      return;
    }
    if (event.type !== 'message') return;
    try {
      const parsed: unknown = JSON.parse(event.data);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) handlers.onMessage(parsed as Record<string, unknown>);
    } catch {
      /* a corrupt frame is replaced by the next one */
    }
  };
  const unsubscribe = window.electron.on('manys:channel:event', (event: ChannelEvent) => {
    if (!channelId) early.push(event);
    else if (event.channelId === channelId) deliver(event);
  });
  const result = (await window.electron.invoke('manys:channel:open', { manyId, channel: kind })) as { success: boolean; error?: string; data?: { channelId: string } };
  if (!result.success || !result.data) {
    unsubscribe();
    throw new Error(result.error ?? 'channel_unavailable');
  }
  channelId = result.data.channelId;
  for (const event of early.splice(0)) if (event.channelId === channelId) deliver(event);
  return {
    send(message) {
      if (closed) return;
      void window.electron.invoke('manys:channel:send', { channelId, data: JSON.stringify(message) });
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      void window.electron.invoke('manys:channel:close', { channelId });
    },
  };
}

/**
 * The WebSocket surface noVNC reads and writes, backed by the desktop channel in the main process.
 * noVNC takes a ready-made channel instead of a URL, which is how it can run here where the socket
 * and its credentials belong to the main process.
 */
export interface DesktopSocket {
  binaryType: string;
  readonly protocol: string;
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: ArrayBufferView | ArrayBuffer): void;
  close(): void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const MAX_SEND_BYTES = 256 * 1024;

/** The person's side of the desktop. `onNotice` carries the computer's own words (the wheel was taken back). */
export function openDesktopSocket(manyId: string, onNotice: (message: Record<string, unknown>) => void): DesktopSocket {
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
  };

  const deliver = (event: ChannelEvent) => {
    if (state === CLOSED) return;
    if (event.type === 'close') {
      finish(event.code);
    } else if (event.type === 'binary') {
      const bytes = event.bytes;
      socket.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
    } else {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) onNotice(parsed as Record<string, unknown>);
      } catch {
        /* not something to act on */
      }
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
      socket.onerror?.(new Error(result.error ?? 'channel_unavailable'));
      finish(1006);
      return;
    }
    channelId = result.data.channelId;
    state = OPEN;
    socket.onopen?.({});
    for (const event of early.splice(0)) if (event.channelId === channelId) deliver(event);
  }, () => {
    socket.onerror?.(new Error('channel_unavailable'));
    finish(1006);
  });
  return socket;
}
