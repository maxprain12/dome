import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCmsDocument, publicationFrontmatter, safeEntryPath } = require('../plugins/plugin-service.cjs');

test('preserves Markdown spacing, HTML and code through import', () => {
  const body = '\n# Title\n\n<br />\n\n\nA&nbsp;B\n\n```html\n<br />\n```\n';
  assert.equal(parseCmsDocument(body).body, body);
  assert.equal(parseCmsDocument(`---\ntitle: Example\n---\n${body}`).body, body);
});

test('parses a published CMS file back into fields', () => {
  const parsed = parseCmsDocument(`---
title: prueba
collection: blog
language: es
date: 2026-09-22
description: prueba
slug: prueba
tags:
  - astro
  - tutorial
---

# prueba

esto es una prueba
`);
  assert.equal(parsed.title, 'prueba');
  assert.equal(parsed.fields.collection, 'blog');
  assert.equal(parsed.fields.date, '2026-09-22');
  assert.deepEqual(parsed.fields.tags, ['astro', 'tutorial']);
  assert.match(parsed.body, /esto es una prueba/);
});

test('rejects entry paths outside the content tree', () => {
  assert.throws(() => safeEntryPath('../secrets.md'));
  assert.equal(safeEntryPath('src/content/blog/es/prueba.md'), 'src/content/blog/es/prueba.md');
});

test('publication frontmatter keeps the CMS fields and omits empty ones', () => {
  const data = publicationFrontmatter('prueba', {
    collection: 'blog',
    language: 'es',
    date: '2026-09-22',
    description: 'prueba',
    cover: '',
    tags: [],
    slug: 'prueba',
  }, {
    fields: [
      { id: 'collection' },
      { id: 'language' },
      { id: 'date' },
      { id: 'description' },
      { id: 'cover' },
      { id: 'tags' },
      { id: 'slug' },
    ],
  });
  assert.equal(data.cover, undefined);
  assert.equal(data.tags, undefined);
  assert.deepEqual(data, {
    title: 'prueba',
    collection: 'blog',
    language: 'es',
    date: '2026-09-22',
    description: 'prueba',
    slug: 'prueba',
  });
});
