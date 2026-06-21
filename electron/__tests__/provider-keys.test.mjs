import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  readProviderApiKey,
  writeProviderApiKey,
  readProviderBaseUrl,
  writeProviderBaseUrl,
  hasProviderApiKey,
  KEYLESS_PROVIDERS,
} = require('../ai/provider-keys.cjs');

/** In-memory settings table compatible with the async DuckDB surface. */
function makeQueries(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getSetting: { get: async (key) => (store.has(key) ? { value: store.get(key) } : undefined) },
    setSetting: { run: async (key, value) => { store.set(key, value); return { changes: 1 }; } },
    _store: store,
  };
}

describe('provider-keys', () => {
  it('reads and writes per-provider keys independently', async () => {
    const q = makeQueries();
    await writeProviderApiKey(q, 'openai', 'sk-openai-123');
    await writeProviderApiKey(q, 'minimax', 'mm-456');
    assert.equal(await readProviderApiKey(q, 'openai'), 'sk-openai-123');
    assert.equal(await readProviderApiKey(q, 'minimax'), 'mm-456');
    assert.equal(await readProviderApiKey(q, 'anthropic'), null);
  });

  it('falls back to the legacy shared key ONLY for the active provider', async () => {
    const q = makeQueries({ ai_provider: 'minimax', ai_api_key: 'legacy-mm-key' });
    // active provider inherits the legacy key (pre-migration installs)
    assert.equal(await readProviderApiKey(q, 'minimax'), 'legacy-mm-key');
    // other providers must NOT see minimax's key
    assert.equal(await readProviderApiKey(q, 'openai'), null);
  });

  it('per-provider key wins over the legacy one', async () => {
    const q = makeQueries({ ai_provider: 'openai', ai_api_key: 'legacy' });
    await writeProviderApiKey(q, 'openai', 'fresh');
    assert.equal(await readProviderApiKey(q, 'openai'), 'fresh');
  });

  it('keyless providers never read or write key slots', async () => {
    const q = makeQueries({ ai_provider: 'dome', ai_api_key: 'should-not-leak' });
    for (const p of KEYLESS_PROVIDERS) {
      await writeProviderApiKey(q, p, 'x');
      assert.equal(await readProviderApiKey(q, p), null, p);
    }
  });

  it('base URL is per-provider with active-only legacy fallback', async () => {
    const q = makeQueries({ ai_provider: 'openrouter', ai_base_url: 'https://legacy.example/v1/' });
    assert.equal(await readProviderBaseUrl(q, 'openrouter'), 'https://legacy.example/v1');
    assert.equal(await readProviderBaseUrl(q, 'openai'), undefined);
    await writeProviderBaseUrl(q, 'openai', 'https://proxy.example/v1');
    assert.equal(await readProviderBaseUrl(q, 'openai'), 'https://proxy.example/v1');
  });

  it('hasProviderApiKey reflects stored state', async () => {
    const q = makeQueries();
    assert.equal(await hasProviderApiKey(q, 'deepseek'), false);
    await writeProviderApiKey(q, 'deepseek', 'ds-key');
    assert.equal(await hasProviderApiKey(q, 'deepseek'), true);
  });
});
