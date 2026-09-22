import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('provider-config loads and does not throw ReferenceError for database', () => {
  const providerConfig = require('../bench/provider-config.cjs');
  assert.equal(typeof providerConfig.applyProviderSettings, 'function');
  assert.equal(typeof providerConfig.getBenchProviderConfig, 'function');
  assert.ok(providerConfig.PROVIDER_DEFAULTS.minimax);

  let caught;
  try {
    providerConfig.applyProviderSettings('minimax', 'MiniMax-M3');
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'expected an error without Electron DB init');
  assert.notEqual(caught.name, 'ReferenceError');
  assert.doesNotMatch(String(caught.message || caught), /database is not defined/i);
});
