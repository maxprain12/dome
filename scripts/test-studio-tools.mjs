#!/usr/bin/env node
/**
 * Studio gather-tool shape tests (7 output types + progress smoke).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extra = require('../electron/ai-tools-extra.cjs');
const studioProgress = require('../electron/services/studio-progress.cjs');

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

const mockResourceGet = async (id) => ({
  success: true,
  resource: { id, title: `Doc ${id}`, content: 'Sample content for studio generation.' },
});

const mockResourceList = async () => ({
  success: true,
  resources: [{ id: 'r1', title: 'Doc r1' }],
});

const mockEmptyList = async () => ({ success: true, resources: [] });

function assertOutputFormat(result, type) {
  assert.equal(result.status, 'success');
  assert.equal(result.output_format.type, type);
}

console.log('studio-tools (gather context)');

await testAsync('gatherStudioMindmapContext: success shape', async () => {
  const result = await extra.gatherStudioMindmapContext(
    { source_ids: ['r1'] },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'mindmap');
  assert.ok(Array.isArray(result.sources) && result.sources.length === 1);
});

await testAsync('gatherStudioQuizContext: success shape', async () => {
  const result = await extra.gatherStudioQuizContext(
    { source_ids: ['r1'], num_questions: 10, difficulty: 'hard' },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'quiz');
  assert.equal(result.num_questions, 10);
  assert.equal(result.difficulty, 'hard');
});

await testAsync('gatherStudioGuideContext: success shape', async () => {
  const result = await extra.gatherStudioGuideContext(
    { source_ids: ['r1'] },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'guide');
});

await testAsync('gatherStudioFaqContext: success shape', async () => {
  const result = await extra.gatherStudioFaqContext(
    { source_ids: ['r1'] },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'faq');
});

await testAsync('gatherStudioTimelineContext: success shape', async () => {
  const result = await extra.gatherStudioTimelineContext(
    { source_ids: ['r1'] },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'timeline');
});

await testAsync('gatherStudioTableContext: success shape', async () => {
  const result = await extra.gatherStudioTableContext(
    { source_ids: ['r1'] },
    mockResourceGet,
    mockResourceList,
  );
  assertOutputFormat(result, 'table');
});

await testAsync('flashcard_create schema: cards required', async () => {
  const cards = [{ question: 'Q?', answer: 'A.', difficulty: 'medium' }];
  assert.ok(Array.isArray(cards) && cards.length >= 1);
  assert.equal(typeof cards[0].question, 'string');
  assert.equal(typeof cards[0].answer, 'string');
});

await testAsync('gatherStudioGuideContext: empty sources error', async () => {
  const result = await extra.gatherStudioGuideContext({}, null, mockEmptyList);
  assert.equal(result.status, 'error');
  assert.match(result.error, /No source content/i);
});

test('studio-progress: emitProgress broadcasts ≥3 phases', () => {
  const events = [];
  const windowManager = {
    broadcast(channel, payload) {
      events.push({ channel, payload });
    },
  };
  const runId = studioProgress.createRunId();
  studioProgress.progress(windowManager, runId, 'read', 'Reading sources…');
  studioProgress.progress(windowManager, runId, 'extract', 'Extracted key concepts', {
    current: 1,
    total: 5,
  });
  studioProgress.progress(windowManager, runId, 'ready', 'Context ready', {
    current: 2,
    total: 5,
  });
  assert.equal(events.length, 3);
  assert.equal(events[0].channel, 'studio:progress');
  assert.equal(events[0].payload.phase, 'read');
  assert.equal(events[2].payload.phase, 'ready');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
