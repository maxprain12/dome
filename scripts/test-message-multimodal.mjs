#!/usr/bin/env node
/**
 * Unit tests for electron/message-multimodal.cjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveModelCapabilities,
  normalizeUserMessage,
  validateMultimodalRequest,
  buildNativeContentBlocks,
} = require('../electron/message-multimodal.cjs');
const { extractMarkdownImages } = require('../shared/message-visual/parse-markdown-images.cjs');

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

console.log('message-multimodal');

test('MiniMax-M3 supports image and video', () => {
  const caps = resolveModelCapabilities('minimax', 'MiniMax-M3');
  assert.equal(caps.supportsImage, true);
  assert.equal(caps.supportsVideo, true);
});

test('MiniMax-M2.7 is text-only', () => {
  const caps = resolveModelCapabilities('minimax', 'MiniMax-M2.7');
  assert.equal(caps.supportsImage, false);
  assert.equal(caps.supportsVideo, false);
});

test('markdown image converts to native blocks for OpenAI', () => {
  const content = `\n![x.png](${TINY_PNG})\n\nHello`;
  const out = normalizeUserMessage(content, { provider: 'openai', modelId: 'gpt-4o-mini' });
  assert.ok(Array.isArray(out));
  assert.ok(out.some((b) => b.type === 'image_url'));
  assert.ok(out.some((b) => b.type === 'text' && b.text.includes('Hello')));
});

test('MiniMax-M2.7 rejects image attachments', () => {
  assert.throws(
    () =>
      normalizeUserMessage('hi', {
        provider: 'minimax',
        modelId: 'MiniMax-M2.7',
        attachments: { images: [{ dataUrl: TINY_PNG }] },
      }),
    /no admite imágenes/i,
  );
});

test('MiniMax-M3 accepts video file reference', () => {
  const blocks = buildNativeContentBlocks({
    text: 'Describe video',
    videos: [{ fileId: '12345' }],
    provider: 'minimax',
    modelId: 'MiniMax-M3',
  });
  assert.ok(blocks.some((b) => b.type === 'video'));
});

test('extractMarkdownImages parses data URL from composer markdown', () => {
  const { text, images } = extractMarkdownImages(`\n![a.png](${TINY_PNG})\n\nHi`);
  assert.equal(images.length, 1);
  assert.ok(images[0].dataUrl.startsWith('data:image/png'));
  assert.ok(text.includes('Hi'));
});

test('validateMultimodalRequest throws for video on gpt-4o', () => {
  assert.throws(
    () =>
      validateMultimodalRequest(
        { supportsImage: true, supportsVideo: false },
        { videos: [{ fileId: '1' }] },
      ),
    /no admite video/i,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
