import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveContentPath } = require('../plugins/plugin-service.cjs');

const contentPaths = {
  'blog/es': 'src/content/blog/es',
  'blog/en': 'src/content/blog/en',
  'manual/es': 'src/content/manual/es',
  'manual/en': 'src/content/manual/en',
};

test('resolves a collection and language to the configured content folder', () => {
  assert.equal(
    resolveContentPath({ contentPaths }, { collection: 'blog', language: 'es' }),
    'src/content/blog/es',
  );
});

test('fails before publication when the collection and language have no mapping', () => {
  assert.throws(
    () => resolveContentPath({ contentPaths }, { collection: 'manual', language: 'fr' }),
    /No content folder configured for manual\/fr/,
  );
});

test('keeps the legacy single-folder configuration working', () => {
  assert.equal(
    resolveContentPath({ pathPrefix: 'src/content/posts' }, { collection: 'blog', language: 'es' }),
    'src/content/posts',
  );
});

test('rejects mappings outside the Astro content tree', () => {
  assert.throws(
    () => resolveContentPath({ contentPaths: { 'blog/es': '../public' } }, { collection: 'blog', language: 'es' }),
    /src\/content/,
  );
});
