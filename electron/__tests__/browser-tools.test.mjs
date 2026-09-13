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

describe('browser result budgets and errors', () => {
  it('keeps a large dashboard valid JSON with fresh IDs and explicit truncation', async () => {
    const tools = createBrowserTools(async () => ({ success: true, data: {
      snapshotId: 'fresh', url: 'https://example.test',
      readableText: 'a'.repeat(32000), viewportText: 'b'.repeat(16000),
      sections: Array.from({ length: 16 }, () => ({ heading: 'Section', text: 'c'.repeat(4000) })),
      tables: Array.from({ length: 8 }, () => ({ rows: Array.from({ length: 30 }, () => Array(16).fill('cell'.repeat(75))) })),
      elements: [{ id: 'e1', label: 'Details' }],
    } }));
    const result = await tools.find((tool) => tool.name === 'browser_read_page').execute('call', {});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.data.snapshotId, 'fresh');
    assert.equal(parsed.data.truncated, true);
    assert.equal(parsed.data.elements[0].id, 'e1');
    assert.ok(result.content[0].text.length <= 100000);
  });

  it('marks a failed browser action as a tool error', async () => {
    const tools = createBrowserTools(async () => ({ success: false, error: 'Page changed' }));
    const result = await tools.find((tool) => tool.name === 'browser_click').execute('call', { snapshotId: 'snapshot', elementId: 'e1' });
    assert.equal(result.isError, true);
  });
});

it('grounds vision reads with a screenshot by default while allowing an explicit text-only read', async () => {
  const seen = [];
  const sighted = createBrowserTools(async (_name, args) => { seen.push(args); return { success: true }; }, { supportsVision: true });
  const read = sighted.find((tool) => tool.name === 'browser_read_page');
  await read.execute('automatic', {});
  await read.execute('text', { includeScreenshot: false });
  assert.deepEqual(seen.map((args) => args.includeScreenshot), [true, false]);
  const blind = createBrowserTools(async (_name, args) => { assert.equal(args.includeScreenshot, false); return { success: true }; });
  await blind.find((tool) => tool.name === 'browser_read_page').execute('blind', { includeScreenshot: true });
});
