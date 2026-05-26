#!/usr/bin/env node
'use strict';

/**
 * Smoke tests for artifact feeder merge helpers and serialization.
 * Run: pnpm run test:feeders
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyUpdatePolicy,
  parseFeederJsonOutput,
  buildExcerpt,
  redactSecrets,
} = require('../electron/services/artifact-data-merge.cjs');
const { hashScript } = require('../electron/services/feeder-runner.cjs');

test('applyUpdatePolicy replace', () => {
  const out = applyUpdatePolicy({ a: 1 }, { b: 2 }, 'replace');
  assert.deepEqual(out, { b: 2 });
});

test('applyUpdatePolicy merge_shallow', () => {
  const out = applyUpdatePolicy({ a: 1, b: 1 }, { b: 2, c: 3 }, 'merge_shallow');
  assert.deepEqual(out, { a: 1, b: 2, c: 3 });
});

test('parseFeederJsonOutput accepts raw JSON stdout', () => {
  const parsed = parseFeederJsonOutput('{"hello":"world"}', 'stdout_json');
  assert.deepEqual(parsed, { hello: 'world' });
});

test('parseFeederJsonOutput accepts fenced JSON', () => {
  const parsed = parseFeederJsonOutput('Here:\n```json\n{"n":42}\n```', 'stdout_json');
  assert.deepEqual(parsed, { n: 42 });
});

test('buildExcerpt truncates long output', () => {
  const long = 'a'.repeat(20_000);
  const ex = buildExcerpt(long, 1000);
  assert.ok(ex.length < long.length);
  assert.match(ex, /truncated/);
});

test('redactSecrets removes secret values from excerpts', () => {
  const redacted = redactSecrets('password=SuperSecret123 end', ['SuperSecret123']);
  assert.equal(redacted, 'password=[REDACTED] end');
});

test('hashScript is stable', () => {
  const a = hashScript('print(1)');
  const b = hashScript('print(1)');
  const c = hashScript('print(2)');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});

console.log('feeder tests passed');
