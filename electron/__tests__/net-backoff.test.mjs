import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fullJitterBackoffMs, parseRetryAfterMs, withJitter } from '../net/backoff.cjs';

describe('backoff', () => {
  it('el jitter completo nunca supera el tope', () => {
    for (let i = 0; i < 20; i += 1) {
      const ms = fullJitterBackoffMs(3, { baseMs: 1000, maxMs: 5000 });
      assert.ok(ms >= 0 && ms <= 5000);
    }
  });

  it('withJitter se queda cerca del valor base', () => {
    const ms = withJitter(10_000, 0.2);
    assert.ok(ms >= 8000 && ms <= 12000);
  });

  it('parsea Retry-After en segundos y en fecha', () => {
    const seconds = { headers: { get: () => '3' } };
    assert.equal(parseRetryAfterMs(seconds), 3000);
    const when = new Date(Date.now() + 5000).toUTCString();
    const date = { headers: { get: () => when } };
    const parsed = parseRetryAfterMs(date);
    assert.ok(parsed != null && parsed >= 0 && parsed <= 6000);
    assert.equal(parseRetryAfterMs({ headers: { get: () => null } }), null);
  });
});
