import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelsCatalog, pollResearch, completeResearch } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Many client', () => {
  it('requests the configured provider model catalog without a query', async () => {
    const sendMessage = vi.fn(async () => ({
      success: true,
      data: { provider: 'openai', models: [], limited: false },
    }));
    vi.stubGlobal('browser', { runtime: { sendMessage } });

    await getModelsCatalog('dxt_test');

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DOME_HTTP',
      path: '/v1/catalogs/models',
      token: 'dxt_test',
    });
  });
});

it('sends only the explicit research lease and bounded result envelope to Desktop', async () => {
  const sendMessage = vi.fn(async () => ({ success: true, data: { requests: [] } }));
  vi.stubGlobal('browser', { runtime: { sendMessage } });
  await pollResearch('paired', 'session', 'https://example.com/', true);
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'DOME_HTTP', method: 'POST', path: '/v1/research/poll', token: 'paired', body: { sessionId: 'session', url: 'https://example.com/', enabled: true } });
  await completeResearch('paired', 'session', 'call', { success: false, error: 'changed' });
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'DOME_HTTP', method: 'POST', path: '/v1/research/result', token: 'paired', body: { sessionId: 'session', callId: 'call', result: { success: false, error: 'changed' } } });
  await pollResearch('paired', 'session', 'https://example.com/', false);
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'DOME_HTTP', method: 'POST', path: '/v1/research/poll', token: 'paired', body: { sessionId: 'session', url: 'https://example.com/', enabled: false } });
});
