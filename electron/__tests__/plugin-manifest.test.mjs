import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { digestManifest, validateManifest } = require('../plugins/manifest.cjs');

const valid = {
  apiVersion: 1,
  id: 'dome-cms',
  name: 'Dome CMS',
  author: 'Dome',
  description: 'Structured publishing',
  version: '1.0.0',
  minDomeVersion: '2.8.9',
  type: 'view',
  entry: 'index.html',
  permissions: ['notes.read', 'notes.write'],
  contributes: {
    view: { id: 'content', title: 'Content' },
    vaultTemplate: {
      id: 'post', title: 'Post', schemaVersion: 1,
      fields: [{ id: 'slug', type: 'slug', label: 'Slug', required: true }],
    },
  },
};

test('accepts the v1 CMS manifest and creates a stable digest', () => {
  const result = validateManifest(valid, '2.8.9');
  assert.equal(result.valid, true);
  assert.equal(digestManifest(result.manifest), digestManifest(result.manifest));
});

test('rejects undeclared manifest properties', () => {
  const result = validateManifest({ ...valid, main: 'server.cjs' }, '2.8.9');
  assert.equal(result.valid, false);
});

test('requires notes.read when notes.write is declared', () => {
  const result = validateManifest({ ...valid, permissions: ['notes.write'] }, '2.8.9');
  assert.equal(result.valid, false);
});

test('invalidates plugins that require a newer Dome version', () => {
  const result = validateManifest({ ...valid, minDomeVersion: '3.0.0' }, '2.8.9');
  assert.deepEqual(result, { valid: false, error: 'Requires Dome 3.0.0 or later' });
});

test('accepts a view plugin that contributes a vault template without entry', () => {
  const { entry: _entry, ...withoutEntry } = valid;
  const result = validateManifest(withoutEntry, '2.8.9');
  assert.equal(result.valid, true);
});

test('rejects a view plugin without entry or vault template', () => {
  const { entry: _entry, ...withoutEntry } = valid;
  const result = validateManifest({
    ...withoutEntry,
    contributes: { view: valid.contributes.view },
  }, '2.8.9');
  assert.equal(result.valid, false);
});

test('requires options for select fields', () => {
  const result = validateManifest({
    ...valid,
    contributes: {
      ...valid.contributes,
      vaultTemplate: {
        ...valid.contributes.vaultTemplate,
        fields: [{ id: 'language', type: 'select', label: 'Language', required: true }],
      },
    },
  }, '2.8.9');
  assert.equal(result.valid, false);
});
