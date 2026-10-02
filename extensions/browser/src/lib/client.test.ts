import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelsCatalog } from './client';

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
