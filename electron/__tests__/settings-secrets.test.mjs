import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isMaskedSecret } = require('../core/settings-secrets.cjs');

describe('settings-secrets', () => {
  it('detects masked display values', () => {
    assert.equal(isMaskedSecret('sk-…abc4'), true);
    assert.equal(isMaskedSecret('••••••••'), true);
    assert.equal(isMaskedSecret('sk-...abc4'), true);
    assert.equal(isMaskedSecret('sk-real-key-here'), false);
    assert.equal(isMaskedSecret('enc:v1:abc'), false);
  });
});
