/**
 * Run: node --test electron/__tests__/exceljs-helpers.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cellValueToPrimitive, serializeCellForJson } = require('../tools/exceljs-helpers.cjs');

describe('exceljs-helpers', () => {
  it('cellValueToPrimitive returns formula error strings', () => {
    const cell = { value: { formula: '=A1', result: { error: '#REF!' } } };
    assert.equal(cellValueToPrimitive(cell), '#REF!');
  });

  it('serializeCellForJson stringifies Date values', () => {
    const iso = '2024-06-15T12:00:00.000Z';
    assert.equal(serializeCellForJson(new Date(iso)), iso);
  });

  it('serializeCellForJson passes through primitives', () => {
    assert.equal(serializeCellForJson(42), 42);
    assert.equal(serializeCellForJson('hello'), 'hello');
    assert.equal(serializeCellForJson(true), true);
  });
});
