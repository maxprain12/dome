#!/usr/bin/env node
/**
 * Learn KPI streak computation tests (pure backend logic).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeStreak, computeLongestStreak, localDayKey } = require('../electron/services/learn-kpis.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('learn-kpis');

test('localDayKey returns YYYY-MM-DD', () => {
  const key = localDayKey(Date.parse('2026-05-26T15:00:00'));
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('computeStreak: consecutive days including today', () => {
  const today = localDayKey(Date.now());
  const yesterday = localDayKey(Date.now() - 86400000);
  const days = new Set([today, yesterday]);
  assert.equal(computeStreak(days), 2);
});

test('computeStreak: empty set → 0', () => {
  assert.equal(computeStreak(new Set()), 0);
});

test('computeLongestStreak: finds max run', () => {
  const days = new Set(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-10']);
  assert.equal(computeLongestStreak(days), 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
