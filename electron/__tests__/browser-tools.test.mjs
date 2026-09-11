/**
 * Browser-extension tool wrappers: vision screenshots stay out of the JSON text.
 * Run: node --test electron/__tests__/browser-tools.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createBrowserTools,
  parseScreenshot,
  splitScreenshot,
} = require('../browser-extension/browser-tools.cjs');

const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';

describe('splitScreenshot', () => {
  it('pulls a data URL out of the payload so JSON text stays small', () => {
    const { payload, image } = splitScreenshot({
      success: true,
      data: { title: 'Ada', screenshot: JPEG },
    });
    assert.equal(payload.data.screenshot, undefined);
    assert.equal(payload.data.screenshotIncluded, true);
    assert.equal(image.mimeType, 'image/jpeg');
    assert.equal(image.data, '/9j/4AAQ');
  });

  it('rejects non-image data URLs', () => {
    assert.equal(parseScreenshot('data:text/html;base64,PGh0bWw+'), null);
  });
});

describe('createBrowserTools', () => {
  it('omits screenshot without vision and attaches an image block with vision', async () => {
    const blind = createBrowserTools(async () => ({ success: true }), { supportsVision: false });
    assert.equal(blind.some((tool) => tool.name === 'browser_screenshot'), false);
    assert.ok(blind.some((tool) => tool.name === 'browser_read_page'));

    const seen = [];
    const sighted = createBrowserTools(async (name, args) => {
      seen.push({ name, args });
      return { success: true, data: { title: 'Ada', screenshot: JPEG } };
    }, { supportsVision: true });
    assert.ok(sighted.some((tool) => tool.name === 'browser_screenshot'));
    const read = sighted.find((tool) => tool.name === 'browser_read_page');
    const result = await read.execute('call', { includeScreenshot: true }, undefined);
    assert.equal(seen[0].name, 'browser_read_page');
    assert.equal(seen[0].args.includeScreenshot, true);
    assert.equal(result.content[0].type, 'text');
    assert.equal(JSON.parse(result.content[0].text).data.screenshot, undefined);
    assert.equal(result.content[1].type, 'image');
    assert.equal(result.content[1].mimeType, 'image/jpeg');
    assert.equal(result.content[1].data, '/9j/4AAQ');
  });
});
