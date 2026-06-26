import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  safeStringify,
  boundToolDetails,
  capToolResultString,
  DETAILS_BUDGET_CHARS,
  SAFE_STRINGIFY_BUDGET_CHARS,
} = require('../tools/tool-result-cap.cjs');

/** Build an object that serializes far beyond `budget` chars without itself being huge to allocate. */
function makeOversizedObject(targetChars) {
  const nodes = [];
  // Each node ~ 90 chars serialized; size the array to blow well past the budget.
  const count = Math.ceil(targetChars / 90) + 1;
  for (let i = 0; i < count; i++) {
    nodes.push({ role: 'cell', name: 'x'.repeat(64), id: i });
  }
  return { nodes };
}

describe('tool-result-cap — ELECTRON-7 OOM guards', () => {
  it('safeStringify passes strings through untouched (no quoting/escaping growth)', () => {
    assert.equal(safeStringify('hello world'), 'hello world');
  });

  it('safeStringify serializes normal objects like JSON.stringify', () => {
    assert.equal(safeStringify({ a: 1, b: 'x' }), '{"a":1,"b":"x"}');
  });

  it('safeStringify aborts oversized objects into a too_large notice instead of OOM-ing', () => {
    const huge = makeOversizedObject(SAFE_STRINGIFY_BUDGET_CHARS + 1_000_000);
    const out = safeStringify(huge);
    assert.equal(typeof out, 'string');
    const parsed = JSON.parse(out);
    assert.equal(parsed.error, 'tool_result_too_large');
  });

  it('safeStringify still propagates circular-reference errors', () => {
    const circ = {};
    circ.self = circ;
    assert.throws(() => safeStringify(circ), /circular|Converting circular/i);
  });

  it('boundToolDetails returns small objects by reference (structured details preserved)', () => {
    const small = { a: 1, nested: { ok: true } };
    assert.equal(boundToolDetails(small), small);
  });

  it('boundToolDetails passes small strings through and marks oversized ones', () => {
    assert.equal(boundToolDetails('short'), 'short');
    const big = 'y'.repeat(DETAILS_BUDGET_CHARS + 10);
    const marked = boundToolDetails(big);
    assert.equal(marked._domeOmitted, 'tool_result_too_large');
    assert.equal(marked.approxChars, big.length);
  });

  it('boundToolDetails collapses an oversized object to a tiny marker (no OOM)', () => {
    const huge = makeOversizedObject(DETAILS_BUDGET_CHARS + 2_000_000);
    const marked = boundToolDetails(huge);
    assert.equal(marked._domeOmitted, 'tool_result_too_large');
    // The marker itself must be trivially small to persist.
    assert.ok(JSON.stringify(marked).length < 100);
  });

  it('boundToolDetails reports unserializable (circular) details without throwing', () => {
    const circ = {};
    circ.self = circ;
    const marked = boundToolDetails(circ);
    assert.equal(marked._domeOmitted, 'tool_result_unserializable');
  });

  it('boundToolDetails passes null/undefined/primitives through', () => {
    assert.equal(boundToolDetails(null), null);
    assert.equal(boundToolDetails(undefined), undefined);
    assert.equal(boundToolDetails(42), 42);
    assert.equal(boundToolDetails(true), true);
  });

  it('capToolResultString truncates past the cap and keeps a hint suffix', () => {
    const long = 'z'.repeat(60_000);
    const capped = capToolResultString('some_tool', long, { maxChars: 10_000 });
    assert.ok(capped.length < long.length);
    assert.ok(capped.includes('truncated'));
  });
});
