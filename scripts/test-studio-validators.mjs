#!/usr/bin/env node
/**
 * Studio validators regression tests (issue #338 + strict create validation).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeQuizCorrect,
  validateAndNormalizeStudioContent,
  validateQuizContent,
  validateMindmapContent,
  validateGuideContent,
} = require('../electron/services/studio-validators.cjs');

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

console.log('studio-validators');

test('normalizeQuizCorrect: string "0" for multiple choice', () => {
  assert.equal(normalizeQuizCorrect('0', 'multiple_choice', ['A', 'B', 'C']), 0);
});

test('normalizeQuizCorrect: letter "A" for multiple choice', () => {
  assert.equal(normalizeQuizCorrect('A', 'multiple_choice', ['Paris', 'London', 'Berlin']), 0);
});

test('normalizeQuizCorrect: boolean true for true_false → 0 (True)', () => {
  assert.equal(normalizeQuizCorrect(true, 'true_false'), 0);
});

test('normalizeQuizCorrect: boolean false for true_false → 1 (False)', () => {
  assert.equal(normalizeQuizCorrect(false, 'true_false'), 1);
});

test('normalizeQuizCorrect: string "true" for true_false → 0', () => {
  assert.equal(normalizeQuizCorrect('true', 'true_false'), 0);
});

test('normalizeQuizCorrect: string "false" for true_false → 1', () => {
  assert.equal(normalizeQuizCorrect('false', 'true_false'), 1);
});

test('normalizeQuizCorrect: number 1 for true_false stays 1 (False in UI)', () => {
  assert.equal(normalizeQuizCorrect(1, 'true_false'), 1);
});

test('normalizeQuizCorrect: 1-based last option (correct === options.length)', () => {
  assert.equal(normalizeQuizCorrect(4, 'multiple_choice', ['A', 'B', 'C', 'D']), 3);
});

test('validateQuizContent: normalizes string correct to number', () => {
  const result = validateQuizContent({
    type: 'quiz',
    questions: [
      {
        id: 'q1',
        type: 'multiple_choice',
        question: 'Capital of France?',
        options: ['Paris', 'London', 'Berlin', 'Madrid'],
        correct: 'A',
        explanation: 'Paris is the capital.',
      },
      {
        id: 'q2',
        type: 'true_false',
        question: 'The sky is blue.',
        correct: true,
        explanation: 'Yes it is.',
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.normalized.questions[0].correct, 0);
  assert.equal(typeof result.normalized.questions[0].correct, 'number');
  assert.equal(result.normalized.questions[1].correct, 0);
});

test('validateQuizContent: rejects empty questions', () => {
  const result = validateQuizContent({ type: 'quiz', questions: [] });
  assert.equal(result.ok, false);
});

test('validateMindmapContent: drops orphan edges', () => {
  const result = validateMindmapContent({
    type: 'mindmap',
    nodes: [{ id: 'a', label: 'Root' }, { id: 'b', label: 'Child' }],
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'missing' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.normalized.edges.length, 1);
  assert.equal(result.normalized.edges[0].target, 'b');
});

test('validateGuideContent: requires valid sections', () => {
  const bad = validateGuideContent({ type: 'guide', sections: [] });
  assert.equal(bad.ok, false);

  const good = validateGuideContent({
    type: 'guide',
    sections: [{ title: 'Intro', content: 'Hello **world**' }],
  });
  assert.equal(good.ok, true);
  assert.equal(good.normalized.sections.length, 1);
});

test('validateAndNormalizeStudioContent: quiz round-trip JSON string', () => {
  const input = {
    type: 'quiz',
    questions: [
      {
        id: 'q1',
        type: 'multiple_choice',
        question: '2+2?',
        options: ['3', '4', '5'],
        correct: 'B',
        explanation: 'Four.',
      },
    ],
  };
  const result = validateAndNormalizeStudioContent('quiz', JSON.stringify(input));
  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.content);
  assert.equal(parsed.questions[0].correct, 1);
});

test('validateAndNormalizeStudioContent: rejects invalid table', () => {
  const result = validateAndNormalizeStudioContent('table', { type: 'table', columns: [], rows: [] });
  assert.equal(result.ok, false);
});

test('validateAndNormalizeStudioContent: flashcards passthrough', () => {
  const result = validateAndNormalizeStudioContent('flashcards', null);
  assert.equal(result.ok, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
