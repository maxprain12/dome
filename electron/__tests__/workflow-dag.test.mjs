import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { topologicalLevels, mergePayloads, getInputPayloads } = require('../agents/workflow-dag.cjs');

const n = (id) => ({ id });
const e = (source, target) => ({ source, target });

describe('workflow-dag', () => {
  it('orders a linear chain into one node per level', () => {
    const levels = topologicalLevels([n('a'), n('b'), n('c')], [e('a', 'b'), e('b', 'c')]);
    assert.deepEqual(levels.map((level) => level.map((node) => node.id)), [['a'], ['b'], ['c']]);
  });

  it('groups independent branches into the same level (diamond)', () => {
    const levels = topologicalLevels(
      [n('a'), n('b'), n('c'), n('d')],
      [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')],
    );
    assert.deepEqual(levels.map((level) => level.map((node) => node.id).sort()), [
      ['a'],
      ['b', 'c'],
      ['d'],
    ]);
  });

  it('handles disconnected nodes as roots', () => {
    const levels = topologicalLevels([n('a'), n('b')], []);
    assert.equal(levels.length, 1);
    assert.deepEqual(levels[0].map((node) => node.id).sort(), ['a', 'b']);
  });

  it('throws on cycles', () => {
    assert.throws(
      () => topologicalLevels([n('a'), n('b')], [e('a', 'b'), e('b', 'a')]),
      /ciclos|dependencias/,
    );
  });

  it('mergePayloads joins texts and dedupes resources', () => {
    const merged = mergePayloads([
      { kind: 'text', text: 'uno', resources: [{ resourceId: 'r1', resourceType: 'note' }] },
      { kind: 'text', text: 'dos', resources: [{ resourceId: 'r1', resourceType: 'note' }, { resourceId: 'r2', resourceType: 'pdf' }] },
    ]);
    assert.equal(merged.kind, 'bundle');
    assert.equal(merged.text, 'uno\n\n---\n\ndos');
    assert.equal(merged.resources.length, 2);
  });

  it('mergePayloads keeps single payload kind and omits empty resources', () => {
    const merged = mergePayloads([{ kind: 'note', text: 'solo' }]);
    assert.equal(merged.kind, 'note');
    assert.equal(merged.resources, undefined);
  });

  it('getInputPayloads collects resolved upstream payloads only', () => {
    const edges = [e('a', 'c'), e('b', 'c'), e('x', 'other')];
    const resolved = { a: { text: 'A' }, x: { text: 'X' } };
    const inputs = getInputPayloads('c', edges, resolved);
    assert.deepEqual(inputs, [{ text: 'A' }]);
  });
});
