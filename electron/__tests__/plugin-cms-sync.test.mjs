import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { remoteMarkdownEntries } = require('../plugins/plugin-service.cjs');

const github = {
  contentPaths: {
    'blog/es': 'src/content/blog/es',
    'blog/en': 'src/content/blog/en',
  },
};

test('lists markdown posts inside the configured collection folders', () => {
  const entries = remoteMarkdownEntries([
    { type: 'blob', path: 'src/content/blog/es/prueba.md' },
    { type: 'blob', path: 'src/content/blog/en/test.md' },
    { type: 'blob', path: 'src/content/blog/es/assets/cover.png' },
    { type: 'blob', path: 'README.md' },
    { type: 'tree', path: 'src/content/blog/es' },
  ], github);
  assert.deepEqual(entries, [
    { path: 'src/content/blog/en/test.md', collection: 'blog', language: 'en', slug: 'test' },
    { path: 'src/content/blog/es/prueba.md', collection: 'blog', language: 'es', slug: 'prueba' },
  ]);
});

test('lists public images with their site path', () => {
  const { remotePublicImages } = require('../plugins/plugin-service.cjs');
  assert.deepEqual(remotePublicImages([
    { type: 'blob', path: 'public/dome-recursos-landing/cover.png', sha: 'abc' },
    { type: 'blob', path: 'public/favicon.ico', sha: 'def' },
    { type: 'blob', path: 'src/content/blog/es/prueba.md', sha: 'ghi' },
  ]), [
    {
      path: 'public/dome-recursos-landing/cover.png',
      sha: 'abc',
      sitePath: '/dome-recursos-landing/cover.png',
    },
  ]);
});
