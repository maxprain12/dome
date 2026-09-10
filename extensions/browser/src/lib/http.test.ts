import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, streamManyHttp } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('http client', () => {
  it('maps a pairing payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { token: 'dxt_abc', clientId: 'c1' } }),
      })),
    );
    const result = await request<{ token: string }>({ path: '/v1/pair', method: 'POST', body: { code: 'ABCD2345' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.token).toBe('dxt_abc');
  });

  it('explains when Dome is closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const result = await request({ path: '/v1/health' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not open/i);
  });

  it('surfaces note conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            success: false,
            error: 'Note was edited elsewhere. Reload before saving.',
            conflict: true,
            note: { id: 'n1', markdown: 'server', updatedAt: 2, title: 'N', projectId: 'p' },
          }),
      })),
    );
    const result = await request({ path: '/v1/notes/n1', method: 'PUT', body: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.conflict).toBe(true);
      expect(result.note?.markdown).toBe('server');
    }
  });

  it('parses Many SSE deltas', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"delta","text":"Hi "}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"delta","text":"there"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: stream,
      })),
    );
    const chunks: string[] = [];
    const result = await streamManyHttp('dxt_x', { action: 'summarize', text: 'page' }, (event) => {
      if (event.type === 'delta' && event.text) chunks.push(event.text);
    });
    expect(result.success).toBe(true);
    expect(chunks.join('')).toBe('Hi there');
  });
});
