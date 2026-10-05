import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDesktopSocket } from './computerChannel';

type Listener = (event: unknown) => void;
let listeners: Listener[];
let invoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  listeners = [];
  invoke = vi.fn(async (channel: string) => (channel === 'manys:channel:open' ? { success: true, data: { channelId: 'c1' } } : { success: true }));
  (window as unknown as { electron: unknown }).electron = {
    invoke,
    on: (_channel: string, callback: Listener) => { listeners.push(callback); return () => { listeners = listeners.filter((item) => item !== callback); }; },
  };
});
afterEach(() => { delete (window as unknown as { electron?: unknown }).electron; });
const emit = (event: unknown) => listeners.slice().forEach((listener) => listener(event));

describe('openDesktopSocket', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sends = () => invoke.mock.calls.filter(([channel]) => channel === 'manys:channel:send').map(([, payload]) => payload as { channelId: string; bytes: Uint8Array });

  it('opens a desktop channel and hands bytes to noVNC as array buffers', async () => {
    const socket = openDesktopSocket('many-1', vi.fn());
    const onopen = vi.fn();
    const onmessage = vi.fn();
    socket.onopen = onopen;
    socket.onmessage = onmessage;
    expect(socket.readyState).toBe(0);
    await settle();
    expect(invoke).toHaveBeenCalledWith('manys:channel:open', { manyId: 'many-1', channel: 'desktop' });
    expect(socket.readyState).toBe(1);
    expect(onopen).toHaveBeenCalledTimes(1);
    emit({ channelId: 'other', type: 'binary', bytes: new Uint8Array([9]) });
    emit({ channelId: 'c1', type: 'binary', bytes: new Uint8Array([1, 2, 3]) });
    const data = onmessage.mock.calls[0][0].data as ArrayBuffer;
    expect(onmessage).toHaveBeenCalledTimes(1);
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(data)]).toEqual([1, 2, 3]);
  });

  it('sends a burst of small writes as one message and copies the bytes', async () => {
    const socket = openDesktopSocket('many-1', vi.fn());
    await settle();
    const backing = new Uint8Array([5, 0, 0, 0, 0, 0, 7, 7]);
    socket.send(backing.subarray(0, 6));
    socket.send(backing.subarray(6));
    backing.fill(0);
    await settle();
    expect(sends()).toHaveLength(1);
    expect(sends()[0].channelId).toBe('c1');
    expect([...sends()[0].bytes]).toEqual([5, 0, 0, 0, 0, 0, 7, 7]);
  });

  it('passes the computer\'s own words on and reports the close once', async () => {
    const onNotice = vi.fn();
    const socket = openDesktopSocket('many-1', onNotice);
    const onclose = vi.fn();
    socket.onclose = onclose;
    await settle();
    emit({ channelId: 'c1', type: 'message', data: '{"type":"error","error":"control_released"}' });
    emit({ channelId: 'c1', type: 'message', data: 'not json' });
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith({ type: 'error', error: 'control_released' });
    emit({ channelId: 'c1', type: 'close', code: 1006 });
    emit({ channelId: 'c1', type: 'close', code: 1006 });
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(3);
    expect(listeners).toHaveLength(0);
    invoke.mockClear();
    socket.send(new Uint8Array([1]));
    await settle();
    expect(sends()).toHaveLength(0);
  });

  it('closes through the main process, and an open that fails closes the socket with an error', async () => {
    const socket = openDesktopSocket('many-1', vi.fn());
    await settle();
    socket.close();
    expect(invoke).toHaveBeenCalledWith('manys:channel:close', { channelId: 'c1' });
    expect(socket.readyState).toBe(3);
    expect(listeners).toHaveLength(0);

    invoke.mockResolvedValueOnce({ success: false, error: 'not_connected' });
    const failed = openDesktopSocket('many-1', vi.fn());
    const onerror = vi.fn();
    const onclose = vi.fn();
    failed.onerror = onerror;
    failed.onclose = onclose;
    await settle();
    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith({ code: 1006 });
    expect(listeners).toHaveLength(0);
  });

  it('releases a channel that opened after the caller had already closed', async () => {
    const socket = openDesktopSocket('many-1', vi.fn());
    socket.close();
    await settle();
    expect(invoke).toHaveBeenCalledWith('manys:channel:close', { channelId: 'c1' });
  });
});
