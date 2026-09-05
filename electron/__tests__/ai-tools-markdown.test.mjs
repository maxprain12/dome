import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { markdownToTipTapJSON } = require('../tools/ai-tools-handler.cjs');

describe('ai-tools-handler characterization', () => {
  it('turns markdown into a TipTap doc JSON string', () => {
    const raw = markdownToTipTapJSON('**hello**');
    const doc = JSON.parse(raw);
    assert.equal(doc.type, 'doc');
    assert.ok(Array.isArray(doc.content));
    assert.ok(doc.content.length > 0);
  });

  it('passes through existing TipTap JSON', () => {
    const existing = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    assert.equal(markdownToTipTapJSON(existing), existing);
  });

  it('returns an empty paragraph for blank input', () => {
    const doc = JSON.parse(markdownToTipTapJSON(''));
    assert.equal(doc.type, 'doc');
    assert.equal(doc.content[0].type, 'paragraph');
  });
});
