/**
 * Tests for i18n / raw-id / text-containment checkers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { diffLocaleParity, flattenKeys, formatParityReport } from '../check-i18n-keys.mjs';
import { looksLikeOpaqueId, scanSelectValue } from '../check-no-raw-ids.mjs';
import { scanDistanceToNow } from '../check-text-containment.mjs';

describe('flattenKeys', () => {
  it('flattens nested objects', () => {
    assert.deepEqual(flattenKeys({ a: { b: 'x' }, c: 'y' }).sort((left, right) => left.localeCompare(right)), [
      'a.b',
      'c',
    ]);
  });
});

describe('diffLocaleParity', () => {
  it('reports missing keys in a sibling locale', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-parity-'));
    for (const lang of ['en', 'es', 'fr', 'pt']) {
      fs.mkdirSync(path.join(root, 'packages/i18n/locales', lang), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'packages/i18n/locales/en/common.json'), JSON.stringify({ hello: 'Hi', nested: { bye: 'Bye' } }));
    fs.writeFileSync(path.join(root, 'packages/i18n/locales/es/common.json'), JSON.stringify({ hello: 'Hola' }));
    fs.writeFileSync(path.join(root, 'packages/i18n/locales/fr/common.json'), JSON.stringify({ hello: 'Salut', nested: { bye: 'Ciao' } }));
    fs.writeFileSync(path.join(root, 'packages/i18n/locales/pt/common.json'), JSON.stringify({ hello: 'Oi', nested: { bye: 'Tchau' } }));
    const result = diffLocaleParity(root);
    const report = formatParityReport(result);
    assert.ok(report.some((line) => line.includes('es/common.json') && line.includes('nested.bye')));
  });
});

describe('scanSelectValue', () => {
  it('flags empty SelectValue', () => {
    const hits = scanSelectValue('<SelectTrigger><SelectValue /></SelectTrigger>\n');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, 'empty-select-value');
  });

  it('allows SelectValue with children', () => {
    const hits = scanSelectValue('<SelectValue>{label}</SelectValue>\n');
    assert.equal(hits.length, 0);
  });
});

describe('looksLikeOpaqueId', () => {
  it('detects uuid and dome ids', () => {
    assert.equal(looksLikeOpaqueId('dfa9d9ab-533e-49f7-84da-226ff712717c'), true);
    assert.equal(looksLikeOpaqueId('Launch Night'), false);
  });
});

describe('scanDistanceToNow', () => {
  it('flags visible relative-time helper', () => {
    const hits = scanDistanceToNow("const label = formatDistanceToNow(date, { addSuffix: true });\n");
    assert.equal(hits.length, 1);
  });
});
