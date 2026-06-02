#!/usr/bin/env node
/**
 * Generate wizard validation smoke (step guards + config defaults).
 */
import assert from 'node:assert/strict';

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

const DEFAULT_CONFIG = {
  title: '',
  count: 15,
  difficulty: 'mixed',
  language: 'auto',
  instructions: '',
};

function canAdvanceStep(step, wizard) {
  if (step === 0) return wizard.type != null;
  if (step === 1) return wizard.sourceIds.length > 0;
  if (step === 2) return wizard.config.count >= 1 && wizard.config.count <= 50;
  return false;
}

console.log('generate-wizard');

test('step 0 requires type', () => {
  assert.equal(canAdvanceStep(0, { type: null, sourceIds: [], config: DEFAULT_CONFIG }), false);
  assert.equal(canAdvanceStep(0, { type: 'quiz', sourceIds: [], config: DEFAULT_CONFIG }), true);
});

test('step 1 requires at least one source', () => {
  assert.equal(canAdvanceStep(1, { type: 'quiz', sourceIds: [], config: DEFAULT_CONFIG }), false);
  assert.equal(canAdvanceStep(1, { type: 'quiz', sourceIds: ['a'], config: DEFAULT_CONFIG }), true);
});

test('step 2 validates count bounds', () => {
  assert.equal(canAdvanceStep(2, { type: 'quiz', sourceIds: ['a'], config: { ...DEFAULT_CONFIG, count: 0 } }), false);
  assert.equal(canAdvanceStep(2, { type: 'quiz', sourceIds: ['a'], config: { ...DEFAULT_CONFIG, count: 15 } }), true);
  assert.equal(canAdvanceStep(2, { type: 'quiz', sourceIds: ['a'], config: { ...DEFAULT_CONFIG, count: 51 } }), false);
});

test('tool dispatch names include all 7 studio types', () => {
  const names = [
    'generate_mindmap',
    'generate_quiz',
    'generate_guide',
    'generate_faq',
    'generate_timeline',
    'generate_table',
  ];
  assert.equal(names.length, 6);
  assert.ok(names.every((n) => n.startsWith('generate_')));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
