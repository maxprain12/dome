import { afterEach, describe, expect, it, vi } from 'vitest';
import { listCloudModels, listCloudProviders, request, setManyModel } from './api';
import { openDesktopSocket } from './computerChannel';
import { getManysTransport, setManysTransport, type ManysTransport } from './transport';
import { ipcTransport } from './ipcTransport';

const fake = (): ManysTransport => ({
  request: vi.fn(async () => ({ ok: true })) as unknown as ManysTransport['request'],
  listProviders: vi.fn(async () => [{ id: 'p1', name: 'Provider' }]),
  listModels: vi.fn(async () => ({ dome: [], saved: [] })),
  setModel: vi.fn(async () => undefined),
  subscribeEvents: vi.fn(() => () => undefined),
  openDesktop: vi.fn(() => ({ binaryType: 'arraybuffer', protocol: '', readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null, send: vi.fn(), close: vi.fn() })),
});

afterEach(() => {
  setManysTransport(ipcTransport);
  delete (window as unknown as { electron?: unknown }).electron;
});

describe('ManysTransport seam', () => {
  it('uses the IPC transport until another one is set', () => {
    expect(getManysTransport()).toBe(ipcTransport);
  });

  it('routes the api helpers through the current transport', async () => {
    const transport = fake();
    setManysTransport(transport);
    await expect(request('/abc', 'PUT', { a: 1 })).resolves.toEqual({ ok: true });
    expect(transport.request).toHaveBeenCalledWith('/abc', 'PUT', { a: 1 });
    await expect(listCloudProviders()).resolves.toEqual([{ id: 'p1', name: 'Provider' }]);
    await listCloudModels();
    expect(transport.listModels).toHaveBeenCalledTimes(1);
    await setManyModel('m1', { source: 'dome', model: 'x' });
    expect(transport.setModel).toHaveBeenCalledWith('m1', { source: 'dome', model: 'x' });
  });

  it('parses the computer notices before they reach the desktop view', () => {
    const transport = fake();
    setManysTransport(transport);
    const onNotice = vi.fn();
    openDesktopSocket('m1', onNotice);
    const handlers = (transport.openDesktop as ReturnType<typeof vi.fn>).mock.calls[0][1] as { onNotice: (text: string) => void };
    handlers.onNotice('{"type":"error","error":"control_released"}');
    handlers.onNotice('not json');
    handlers.onNotice('[1]');
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith({ type: 'error', error: 'control_released' });
  });
});

describe('ipcTransport', () => {
  it('maps the main process answers to values and errors', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'manys:cloud-providers') return { success: true, data: { providers: [{ id: 'a', name: 'A' }] } };
      if (channel === 'manys:cloud-models') return { success: true };
      return { success: false, error: 'plan_required' };
    });
    (window as unknown as { electron: unknown }).electron = { invoke };
    await expect(ipcTransport.listProviders()).resolves.toEqual([{ id: 'a', name: 'A' }]);
    await expect(ipcTransport.listModels()).resolves.toEqual({ dome: [], saved: [] });
    await expect(ipcTransport.request('/x')).rejects.toThrow('plan_required');
    expect(invoke).toHaveBeenCalledWith('manys:request', { path: '/x', method: 'GET', body: undefined });
    await expect(ipcTransport.setModel('m', { source: 'dome', model: 'z' })).rejects.toThrow('plan_required');
  });

  it('subscribes and unsubscribes the live feed, and is silent without a bridge', () => {
    expect(ipcTransport.subscribeEvents(vi.fn())()).toBeUndefined();
    const off = vi.fn();
    const on = vi.fn(() => off);
    const invoke = vi.fn(async () => ({ success: true }));
    (window as unknown as { electron: unknown }).electron = { invoke, on };
    const unsubscribe = ipcTransport.subscribeEvents(vi.fn());
    expect(on).toHaveBeenCalledWith('manys:events:event', expect.any(Function));
    expect(invoke).toHaveBeenCalledWith('manys:events:subscribe');
    unsubscribe();
    expect(off).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('manys:events:unsubscribe');
  });
});
