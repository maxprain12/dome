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

/** In-memory settings table compatible with the prepared-statement surface. */
function makeQueries(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getSetting: { get: (key) => (store.has(key) ? { value: store.get(key) } : undefined) },
    setSetting: { run: (key, value) => store.set(key, value) },
    _store: store,
  };
}

describe('provider-keys', () => {
  it('reads and writes per-provider keys independently', () => {
    const q = makeQueries();
    writeProviderApiKey(q, 'openai', 'sk-openai-123');
    writeProviderApiKey(q, 'minimax', 'mm-456');
    assert.equal(readProviderApiKey(q, 'openai'), 'sk-openai-123');
    assert.equal(readProviderApiKey(q, 'minimax'), 'mm-456');
    assert.equal(readProviderApiKey(q, 'anthropic'), null);
  });

  it('falls back to the legacy shared key ONLY for the active provider', () => {
    const q = makeQueries({ ai_provider: 'minimax', ai_api_key: 'legacy-mm-key' });
    // active provider inherits the legacy key (pre-migration installs)
    assert.equal(readProviderApiKey(q, 'minimax'), 'legacy-mm-key');
    // other providers must NOT see minimax's key
    assert.equal(readProviderApiKey(q, 'openai'), null);
  });

  it('per-provider key wins over the legacy one', () => {
    const q = makeQueries({ ai_provider: 'openai', ai_api_key: 'legacy' });
    writeProviderApiKey(q, 'openai', 'fresh');
    assert.equal(readProviderApiKey(q, 'openai'), 'fresh');
  });

  it('keyless providers never read or write key slots', () => {
    const q = makeQueries({ ai_provider: 'dome', ai_api_key: 'should-not-leak' });
    for (const p of KEYLESS_PROVIDERS) {
      writeProviderApiKey(q, p, 'x');
      assert.equal(readProviderApiKey(q, p), null, p);
    }
  });

  it('base URL is per-provider with active-only legacy fallback', () => {
    const q = makeQueries({ ai_provider: 'openrouter', ai_base_url: 'https://legacy.example/v1/' });
    assert.equal(readProviderBaseUrl(q, 'openrouter'), 'https://legacy.example/v1');
    assert.equal(readProviderBaseUrl(q, 'openai'), undefined);
    writeProviderBaseUrl(q, 'openai', 'https://proxy.example/v1');
    assert.equal(readProviderBaseUrl(q, 'openai'), 'https://proxy.example/v1');
  });

  it('hasProviderApiKey reflects stored state', () => {
    const q = makeQueries();
    assert.equal(hasProviderApiKey(q, 'deepseek'), false);
    writeProviderApiKey(q, 'deepseek', 'ds-key');
    assert.equal(hasProviderApiKey(q, 'deepseek'), true);
  });
});
