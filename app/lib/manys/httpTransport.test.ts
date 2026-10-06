import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpTransport } from './httpTransport';
import type { ManyEvent } from './liveRuns';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('httpTransport.request', () => {
  it('calls the manys API with the cookie session and the csrf header', async () => {
    const fetchMock = vi.fn(async () => json(200, { id: 'm1' }));
    const transport = createHttpTransport({ base: 'https://app.test/', fetch: fetchMock as unknown as typeof fetch });
    await expect(transport.request('/m1/tasks', 'POST', { prompt: 'hi' })).resolves.toEqual({ id: 'm1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.test/api/v1/manys/m1/tasks');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-manys-csrf': '1' });
    expect(init.body).toBe('{"prompt":"hi"}');
  });

  it('defaults to GET without a body and treats an empty success as {}', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const transport = createHttpTransport({ fetch: fetchMock as unknown as typeof fetch });
    await expect(transport.request('/m1')).resolves.toEqual({});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/manys/m1');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('throws the server error code and hides anything that is not a plain code', async () => {
    const answers = [
      json(403, { error: 'plan_required' }),
      json(500, { error: 'Something <bad> happened' }),
      json(502, { error: 'manys_unavailable' }),
      new Response('', { status: 503 }),
      new Response('<html>', { status: 500 }),
    ];
    const transport = createHttpTransport({ fetch: (async () => answers.shift()) as unknown as typeof fetch });
    await expect(transport.request('/a')).rejects.toThrow('plan_required');
    await expect(transport.request('/a')).rejects.toThrow('service_unavailable');
    await expect(transport.request('/a')).rejects.toThrow('service_unavailable');
    await expect(transport.request('/a')).rejects.toThrow('service_unavailable');
    await expect(transport.request('/a')).rejects.toThrow('service_unavailable');
  });

  it('maps a network failure to service_unavailable and refuses oversized bodies', async () => {
    const transport = createHttpTransport({ fetch: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    await expect(transport.request('/a')).rejects.toThrow('service_unavailable');
    await expect(transport.request('/a', 'POST', { text: 'x'.repeat(1048577) })).rejects.toThrow('request_too_large');
  });

  it('maps the provider, model and selection endpoints', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/provider-keys')) return json(200, [{ id: 'p', name: 'P' }]);
      if (url.endsWith('/models-catalog')) return json(200, { dome: [] });
      return json(200, {});
    });
    const transport = createHttpTransport({ fetch: fetchMock as unknown as typeof fetch });
    await expect(transport.listProviders()).resolves.toEqual([{ id: 'p', name: 'P' }]);
    await expect(transport.listModels()).resolves.toEqual({ dome: [], saved: [] });
    await transport.setModel('m1', { source: 'external', provider: 'p', model: 'x', thinking: 'low' });
    const [url, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/manys/m1/model');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ source: 'external', provider: 'p', model: 'x', thinking: 'low' });
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string, public init?: EventSourceInit) { FakeEventSource.instances.push(this); }
  close() { this.closed = true; }
  push(row: unknown) { this.onmessage?.({ data: typeof row === 'string' ? row : JSON.stringify(row) }); }
}

describe('httpTransport.subscribeEvents', () => {
  beforeEach(() => { FakeEventSource.instances = []; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const make = () => createHttpTransport({ base: 'https://app.test', EventSource: FakeEventSource as unknown as typeof EventSource });
  const row = (sequence: number, extra: Record<string, unknown> = {}) => ({ sequence, kind: 'run_text', task_id: 't', many_id: 'm', data: { text: 'x' }, noise: true, ...extra });

  it('shares one credentialed stream per page and relays only the event fields', () => {
    const transport = make();
    const a = vi.fn();
    const b = vi.fn();
    const offA = transport.subscribeEvents(a);
    const offB = transport.subscribeEvents(b);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('https://app.test/api/v1/manys/events?after=latest');
    expect(FakeEventSource.instances[0].init).toEqual({ withCredentials: true });
    FakeEventSource.instances[0].push(row(5));
    const expected: ManyEvent = { sequence: 5, kind: 'run_text', task_id: 't', many_id: 'm', data: { text: 'x' } };
    expect(a).toHaveBeenCalledWith(expected);
    expect(b).toHaveBeenCalledWith(expected);
    offA();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    offB();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('skips replayed, stale and broken events', () => {
    const transport = make();
    const listener = vi.fn();
    transport.subscribeEvents(listener);
    const stream = FakeEventSource.instances[0];
    stream.push(row(3));
    stream.push(row(3));
    stream.push(row(2));
    stream.push('{not json');
    stream.push({ kind: 'x' });
    stream.push(row(4));
    expect(listener.mock.calls.map(([event]) => (event as ManyEvent).sequence)).toEqual([3, 4]);
  });

  it('reconnects from the last delivered sequence when the stream ends', () => {
    const transport = make();
    const listener = vi.fn();
    transport.subscribeEvents(listener);
    const first = FakeEventSource.instances[0];
    first.onopen?.();
    first.push(row(7));
    first.onerror?.();
    expect(first.closed).toBe(true);
    vi.advanceTimersByTime(0);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toContain('after=7');
    FakeEventSource.instances[1].push(row(7));
    FakeEventSource.instances[1].push(row(8));
    expect(listener.mock.calls.map(([event]) => (event as ManyEvent).sequence)).toEqual([7, 8]);
  });

  it('backs off while the server cannot be reached and stops when nobody listens', () => {
    const transport = make();
    const off = transport.subscribeEvents(vi.fn());
    FakeEventSource.instances[0].onerror?.();
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].onerror?.();
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);
    off();
    FakeEventSource.instances[2].onerror?.();
    vi.advanceTimersByTime(60000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  binaryType = 'blob';
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: unknown[] = [];
  closedWith: number | null = null;
  constructor(public url: string) { FakeWebSocket.instances.push(this); }
  send(data: unknown) { this.sent.push(data); }
  close(code?: number) { this.closedWith = code ?? null; }
}

describe('httpTransport.openDesktop', () => {
  beforeEach(() => { FakeWebSocket.instances = []; });
  const make = (base = 'https://app.test') => createHttpTransport({ base, WebSocket: FakeWebSocket as unknown as typeof WebSocket });

  it('opens the desktop socket on the same origin and keeps the noVNC socket shape', () => {
    const socket = make().openDesktop('m1', {});
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://app.test/api/v1/manys/m1/computer/desktop');
    expect(ws.binaryType).toBe('arraybuffer');
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.readyState).toBe(0);
    expect(make('http://localhost:3000').openDesktop('m2', {})).toBeDefined();
    expect(FakeWebSocket.instances[1].url).toBe('ws://localhost:3000/api/v1/manys/m2/computer/desktop');
  });

  it('routes text frames to notices and binary frames to the viewer', () => {
    const handlers = { onOpen: vi.fn(), onClose: vi.fn(), onError: vi.fn(), onMessage: vi.fn(), onNotice: vi.fn() };
    const socket = make().openDesktop('m1', handlers);
    const onopen = vi.fn();
    const onmessage = vi.fn();
    const onclose = vi.fn();
    socket.onopen = onopen;
    socket.onmessage = onmessage;
    socket.onclose = onclose;
    const ws = FakeWebSocket.instances[0];
    ws.readyState = 1;
    ws.onopen?.();
    ws.onmessage?.({ data: '{"type":"error","error":"control_released"}' });
    const frame = new Uint8Array([1, 2, 3]).buffer;
    ws.onmessage?.({ data: frame });
    expect(onopen).toHaveBeenCalledTimes(1);
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    expect(handlers.onNotice).toHaveBeenCalledWith('{"type":"error","error":"control_released"}');
    expect(onmessage).toHaveBeenCalledTimes(1);
    expect(onmessage.mock.calls[0][0].data).toBe(frame);
    expect(handlers.onMessage).toHaveBeenCalledWith(frame);
    ws.onclose?.({ code: 1001 });
    expect(onclose).toHaveBeenCalledWith({ code: 1001 });
    expect(handlers.onClose).toHaveBeenCalledWith(1001);
    ws.onerror?.(new Error('x'));
    expect(handlers.onError).toHaveBeenCalledTimes(1);
  });

  it('sends only while open and closes normally', () => {
    const socket = make().openDesktop('m1', {});
    const ws = FakeWebSocket.instances[0];
    socket.send(new Uint8Array([1]));
    expect(ws.sent).toHaveLength(0);
    ws.readyState = 1;
    socket.send(new Uint8Array([2]));
    expect(ws.sent).toHaveLength(1);
    socket.close();
    expect(ws.closedWith).toBe(1000);
  });
});
