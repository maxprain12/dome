/**
 * Locks the multimodal capability contract that decides whether a pasted/attached
 * image actually reaches the model (issue #453: "Ningún modelo procesa imágenes
 * pegadas"). The renderer paste-gate (useComposerMultimodalCapabilities) and this
 * main-side resolver must agree, or an image is either blocked at paste or stripped
 * before the model.
 *
 * Run: node --test electron/__tests__/message-multimodal-caps.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mm = require('../ai/message-multimodal.cjs');

describe('resolveModelCapabilities — vision gating', () => {
  it('MiniMax-M3 supports image (and video) — case-insensitive', () => {
    const caps = mm.resolveModelCapabilities('minimax', 'MiniMax-M3');
    assert.equal(caps.supportsImage, true);
    assert.equal(caps.supportsVideo, true);
    assert.ok(caps.input.includes('image'));
  });

  it('MiniMax text-only variants do NOT support image', () => {
    for (const id of ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5']) {
      const caps = mm.resolveModelCapabilities('minimax', id);
      assert.equal(caps.supportsImage, false, `${id} should be text-only`);
    }
  });

  it('OpenCode Go: kimi-k2.6 + minimax-m3 vision; glm-5.2 text-only', () => {
    assert.equal(mm.resolveModelCapabilities('opencode-go', 'kimi-k2.6').supportsImage, true);
    assert.equal(mm.resolveModelCapabilities('opencode-go', 'minimax-m3').supportsImage, true);
    assert.equal(mm.resolveModelCapabilities('opencode-go', 'glm-5.2').supportsImage, false);
  });

  it('mainstream vision providers resolve to image-capable', () => {
    assert.equal(mm.resolveModelCapabilities('anthropic', 'claude-opus-4-8').supportsImage, true);
    assert.equal(mm.resolveModelCapabilities('google', 'gemini-3-pro-preview').supportsImage, true);
    assert.equal(mm.resolveModelCapabilities('openai', 'gpt-5.2').supportsImage, true);
  });
});

describe('buildImageContent — image reaches the model as a real block', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('M3 (anthropic-messages) → base64 image source block', () => {
    const blocks = mm.buildImageContent('describe this', [PNG], { provider: 'minimax', modelId: 'MiniMax-M3' });
    const img = blocks.find((b) => b.type === 'image');
    assert.ok(img, 'an image block must be present');
    assert.equal(img.source.type, 'base64');
    assert.equal(img.source.media_type, 'image/png');
    assert.ok(img.source.data && img.source.data.length > 0);
  });

  it('text-only model throws/strips rather than smuggling base64 text', () => {
    // validateMultimodalRequest should reject an image for a text-only model,
    // so we never leak base64 into the prompt.
    assert.throws(() =>
      mm.buildImageContent('hi', [PNG], { provider: 'minimax', modelId: 'MiniMax-M2.7-highspeed' }),
    );
  });
});
