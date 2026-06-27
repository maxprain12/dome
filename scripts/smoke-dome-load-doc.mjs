#!/usr/bin/env node
/** Smoke: all dome_load_doc ids resolve via tool-prompt-loader. */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { getSectionBody, DOC_MANIFEST } = require('../electron/prompts/tool-prompt-loader.cjs');

const ids = Object.keys(DOC_MANIFEST);
assert.equal(ids.length, 14, `expected 14 doc ids, got ${ids.length}`);

for (const id of ids) {
  const body = getSectionBody(id);
  assert.ok(body && body.trim().length > 100, `missing or empty body for ${id}`);
}

console.log('[smoke-dome-load-doc] OK —', ids.length, 'docs loaded');
