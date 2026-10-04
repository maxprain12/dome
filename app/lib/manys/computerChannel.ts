export type ComputerChannelKind = 'stream' | 'terminal';

export interface ComputerChannel {
  send(message: Record<string, unknown>): void;
  close(): void;
}
export interface ComputerChannelHandlers {
  onMessage(message: Record<string, unknown>): void;
  onClose(code: number): void;
}
type ChannelEvent = { channelId: string; type: 'message'; data: string } | { channelId: string; type: 'close'; code: number };

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
