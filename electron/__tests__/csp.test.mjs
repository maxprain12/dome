/**
 * Renderer CSP must allow remote social video (Instagram Reels, X, LinkedIn).
 * Run: node --test electron/__tests__/csp.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildCsp } = require('../core/csp.cjs');

describe('renderer CSP', () => {
  it('allows https media in development and production', () => {
    for (const isDev of [true, false]) {
      const csp = buildCsp(isDev);
      const media = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('media-src'));
      assert.match(media, /\bhttps:/, `media-src missing https: (${isDev ? 'dev' : 'prod'}): ${media}`);
      assert.match(media, /\bblob:/);
    }
  });
});
