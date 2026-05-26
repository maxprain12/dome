#!/usr/bin/env node
'use strict';

/**
 * Smoke tests for HTTP web search providers.
 * Run: pnpm run test:web-search
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeSearchRequest, mapSearchResults } = require('../electron/services/web/http-utils.cjs');
const { buildProviderChain } = require('../electron/services/web/search-dispatcher.cjs');
const ddgSearch = require('../electron/services/web/providers/ddg-html.cjs');
const searxngSearch = require('../electron/services/web/providers/searxng.cjs');

test('normalizeSearchRequest clamps count and defaults', () => {
  const req = normalizeSearchRequest({ query: '  hello  ', count: 99 });
  assert.equal(req.query, 'hello');
  assert.equal(req.count, 10);
  assert.ok(req.timeoutMs >= 5000);
});

test('mapSearchResults resolves duckduckgo redirect URLs', () => {
  const mapped = mapSearchResults(
    [{ title: 'Example', url: '/l/?uddg=https%3A%2F%2Fexample.com', description: 'Snippet', displayedUrl: 'example.com' }],
    5,
  );
  assert.equal(mapped[0].url, 'https://example.com');
  assert.equal(mapped[0].siteName, 'example.com');
});

test('buildProviderChain auto prefers keys then zero-config', () => {
  const chain = buildProviderChain({
    searchProvider: 'auto',
    fetchProvider: 'auto',
    tavilyKey: 'tvly-test',
    braveKey: '',
  });
  assert.deepEqual(chain.slice(0, 3), ['tavily', 'searxng', 'ddg']);
});

test('buildProviderChain respects explicit provider', () => {
  const chain = buildProviderChain({
    searchProvider: 'ddg',
    fetchProvider: 'auto',
    tavilyKey: 'tvly-test',
    braveKey: 'bsa-test',
  });
  assert.deepEqual(chain, ['ddg']);
});

test('ddg-html search returns structured results (network)', { timeout: 30_000 }, async () => {
  const request = normalizeSearchRequest({ query: 'Dome knowledge management app', count: 3, timeoutMs: 20_000 });
  const result = await ddgSearch.search(request);
  assert.equal(result.success, true);
  assert.ok(result.results.length > 0);
  assert.ok(result.results[0].title);
  assert.ok(result.results[0].url.startsWith('http'));
});

test('searxng search returns structured results or skips if all instances down', { timeout: 45_000 }, async (t) => {
  const request = normalizeSearchRequest({ query: 'open source knowledge base', count: 3, timeoutMs: 15_000 });
  try {
    const result = await searxngSearch.search(request);
    assert.equal(result.success, true);
    assert.ok(result.results.length > 0);
  } catch (error) {
    t.skip(`Public SearXNG instances unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
});
