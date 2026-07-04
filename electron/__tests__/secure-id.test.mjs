import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { secureRandomSuffix, secureTimestampId } = require('../core/secure-id.cjs');

describe('secure-id', () => {
  it('secureRandomSuffix returns hex of expected length', () => {
    const s = secureRandomSuffix(8);
    assert.match(s, /^[0-9a-f]{16}$/);
  });

  it('secureTimestampId includes prefix and unique suffix', () => {
    const a = secureTimestampId('res');
    const b = secureTimestampId('res');
    assert.match(a, /^res_\d+_[0-9a-f]{12}$/);
    assert.notEqual(a, b);
  });
});
