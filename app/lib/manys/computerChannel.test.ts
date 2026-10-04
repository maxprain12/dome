import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openComputerChannel } from './computerChannel';
import { isPasteShortcut, keyMessage, modifierBits, mouseMessage, pagePoint, wheelMessage } from './screenInput';

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

describe('openComputerChannel', () => {
  it('relays only this channel\'s frames, as parsed objects', async () => {
    const onMessage = vi.fn();
    await openComputerChannel('many-1', 'terminal', { onMessage, onClose: vi.fn() });
    expect(invoke).toHaveBeenCalledWith('manys:channel:open', { manyId: 'many-1', channel: 'terminal' });
    emit({ channelId: 'other', type: 'message', data: '{"type":"output"}' });
    emit({ channelId: 'c1', type: 'message', data: '{"type":"output","data":"aGk="}' });
    emit({ channelId: 'c1', type: 'message', data: 'not json' });
    emit({ channelId: 'c1', type: 'message', data: '[1]' });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: 'output', data: 'aGk=' });
  });

  it('keeps frames that arrive before the open call returns', async () => {
    const onMessage = vi.fn();
    invoke.mockImplementationOnce(async () => {
      emit({ channelId: 'c1', type: 'message', data: '{"type":"ready"}' });
      return { success: true, data: { channelId: 'c1' } };
    });
    await openComputerChannel('many-1', 'stream', { onMessage, onClose: vi.fn() });
    expect(onMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('sends JSON, reports the close once, and stops after the caller closes', async () => {
    const onClose = vi.fn();
    const channel = await openComputerChannel('many-1', 'stream', { onMessage: vi.fn(), onClose });
    channel.send({ type: 'text', text: 'hi' });
    expect(invoke).toHaveBeenCalledWith('manys:channel:send', { channelId: 'c1', data: '{"type":"text","text":"hi"}' });
    emit({ channelId: 'c1', type: 'close', code: 1006 });
    emit({ channelId: 'c1', type: 'close', code: 1006 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(1006);
    invoke.mockClear();
    channel.send({ type: 'text', text: 'late' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('closes through the main process and throws a readable code when it cannot open', async () => {
    const channel = await openComputerChannel('many-1', 'stream', { onMessage: vi.fn(), onClose: vi.fn() });
    channel.close();
    expect(invoke).toHaveBeenCalledWith('manys:channel:close', { channelId: 'c1' });
    expect(listeners).toHaveLength(0);
    invoke.mockResolvedValueOnce({ success: false, error: 'not_connected' });
    await expect(openComputerChannel('many-1', 'stream', { onMessage: vi.fn(), onClose: vi.fn() })).rejects.toThrow('not_connected');
    expect(listeners).toHaveLength(0);
  });
});

describe('screen input', () => {
  const none = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  it('maps a click back to the viewport and clamps to it', () => {
    const frame = { width: 1280, height: 800 };
    const box = { left: 10, top: 20, width: 640, height: 400 };
    expect(pagePoint(frame, box, { clientX: 330, clientY: 220 })).toEqual({ x: 640, y: 400 });
    expect(pagePoint(frame, box, { clientX: 5000, clientY: -50 })).toEqual({ x: 1279, y: 0 });
    expect(pagePoint(frame, { ...box, width: 0 }, { clientX: 1, clientY: 1 })).toBeNull();
  });
  it('encodes modifiers, buttons, text and wheel like the computer expects', () => {
    expect(modifierBits({ shiftKey: true, altKey: true, ctrlKey: true, metaKey: true })).toBe(15);
    expect(mouseMessage('pressed', { x: 1, y: 2 }, { ...none, button: 2, detail: 2 })).toMatchObject({ button: 'right', clickCount: 2 });
    expect(mouseMessage('moved', { x: 1, y: 2 }, { ...none, button: 0, detail: 0 })).toMatchObject({ clickCount: 0 });
    expect(keyMessage('down', { ...none, key: 'a', code: 'KeyA', keyCode: 65 })).toMatchObject({ text: 'a', windowsVirtualKeyCode: 65 });
    expect(keyMessage('down', { ...none, key: 'Enter', code: 'Enter', keyCode: 13 })).not.toHaveProperty('text');
    expect(wheelMessage({ x: 3, y: 4 }, { ...none, deltaX: 0, deltaY: 120 })).toMatchObject({ type: 'wheel', deltaY: 120 });
    expect(isPasteShortcut({ key: 'V', metaKey: true, ctrlKey: false })).toBe(true);
    expect(isPasteShortcut({ key: 'v', metaKey: false, ctrlKey: false })).toBe(false);
  });
});
