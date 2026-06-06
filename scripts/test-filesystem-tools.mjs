#!/usr/bin/env node
'use strict';

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { capToolResultString, getCapForTool } = require('../electron/tools/tool-result-cap.cjs');
const { buildFileTree, shouldExcludeEntry } = require('../electron/tools/file-tree.cjs');

test('getCapForTool uses aggressive cap for directory_tree', () => {
  assert.equal(getCapForTool('directory_tree'), 12_000);
  assert.equal(getCapForTool('file_list'), 48_000);
});

test('capToolResultString truncates oversized directory_tree output', () => {
  const huge = 'x'.repeat(20_000);
  const out = capToolResultString('directory_tree', huge);
  assert.ok(out.length < huge.length);
  assert.match(out, /file_list|file_tree|file_search/i);
});

test('shouldExcludeEntry skips node_modules', () => {
  assert.equal(shouldExcludeEntry('node_modules', ['node_modules']), true);
  assert.equal(shouldExcludeEntry('src', ['node_modules']), false);
});

test('buildFileTree respects max_depth and max_entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'dome-file-tree-'));
  try {
    mkdirSync(join(root, 'a'));
    mkdirSync(join(root, 'a', 'b'));
    writeFileSync(join(root, 'a', 'b', 'deep.txt'), 'hi');
    writeFileSync(join(root, 'top.txt'), 'hi');

    const shallow = buildFileTree(root, { maxDepth: 1, maxEntries: 50 });
    assert.equal(shallow.status, 'success');
    assert.equal(shallow.truncated, false);
    const children = shallow.tree?.children ?? [];
    assert.ok(children.some((c) => c.name === 'a' && c.isDirectory));
    assert.ok(!children.some((c) => c.name === 'deep.txt'));

    const tiny = buildFileTree(root, { maxDepth: 3, maxEntries: 1 });
    assert.equal(tiny.status, 'success');
    assert.equal(tiny.truncated, true);
    assert.equal(tiny.shown, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('filesystem tool tests passed');
