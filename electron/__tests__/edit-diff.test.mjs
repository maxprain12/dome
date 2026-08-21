/**
 * Line diffing for file_edit / file_write.
 * Run: node --test electron/__tests__/edit-diff.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeDiff, buildEditDiff, formatUnifiedPatch, splitLines } = require('../coding/edit-diff.cjs');
const { fileEdit, fileWrite } = require('../tools/file-disk-tools.cjs');

const lines = (...xs) => xs.join('\n');

describe('splitLines', () => {
  it('does not invent a trailing empty line', () => {
    assert.deepEqual(splitLines('a\nb\n'), ['a', 'b']);
    assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
    assert.deepEqual(splitLines(''), []);
  });
});

describe('computeDiff', () => {
  it('reports no hunks for identical content', () => {
    const r = computeDiff('a\nb\nc', 'a\nb\nc');
    assert.deepEqual(r.hunks, []);
    assert.equal(r.added, 0);
    assert.equal(r.removed, 0);
    assert.equal(r.firstChangedLine, undefined);
  });

  it('an insertion near the top does not mark the rest as changed', () => {
    // This is exactly what the previous lockstep walker got wrong.
    const before = lines('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    const after = lines('a', 'NEW', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    const r = computeDiff(before, after);
    assert.equal(r.added, 1);
    assert.equal(r.removed, 0);
    assert.equal(r.firstChangedLine, 2);
  });

  it('counts a single-line replacement as one add and one remove', () => {
    const r = computeDiff(lines('x', 'y', 'z'), lines('x', 'Y2', 'z'));
    assert.equal(r.added, 1);
    assert.equal(r.removed, 1);
    assert.equal(r.firstChangedLine, 2);
  });

  it('reports a deletion at its position in the old file', () => {
    const r = computeDiff(lines('a', 'b', 'c'), lines('a', 'c'));
    assert.equal(r.added, 0);
    assert.equal(r.removed, 1);
  });

  it('handles insertion into empty content', () => {
    const r = computeDiff('', lines('a', 'b'));
    assert.equal(r.added, 2);
    assert.equal(r.removed, 0);
  });

  it('handles deleting all content', () => {
    const r = computeDiff(lines('a', 'b'), '');
    assert.equal(r.added, 0);
    assert.equal(r.removed, 2);
  });

  it('splits distant changes into separate hunks', () => {
    const before = Array.from({ length: 60 }, (_, i) => `line-${i}`).join('\n');
    const after = before.split('\n').map((l, i) => (i === 2 || i === 50 ? `${l}-changed` : l)).join('\n');
    const r = computeDiff(before, after, { contextLines: 2 });
    assert.equal(r.hunks.length, 2);
    assert.equal(r.added, 2);
    assert.equal(r.removed, 2);
  });

  it('merges nearby changes into one hunk', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n');
    const after = before.split('\n').map((l, i) => (i === 5 || i === 6 ? `${l}-changed` : l)).join('\n');
    const r = computeDiff(before, after, { contextLines: 3 });
    assert.equal(r.hunks.length, 1);
  });

  it('hunk headers count their own lines', () => {
    const r = computeDiff(lines('a', 'b', 'c'), lines('a', 'B', 'c'));
    const hunk = r.hunks[0];
    assert.equal(hunk.oldLines, hunk.lines.filter((l) => l.type !== '+').length);
    assert.equal(hunk.newLines, hunk.lines.filter((l) => l.type !== '-').length);
  });
});

describe('formatUnifiedPatch', () => {
  it('emits a standard header and hunk marker', () => {
    const { hunks } = computeDiff(lines('a', 'b'), lines('a', 'B'));
    const patch = formatUnifiedPatch('src/x.ts', hunks);
    assert.match(patch, /^--- a\/src\/x\.ts/m);
    assert.match(patch, /^\+\+\+ b\/src\/x\.ts/m);
    assert.match(patch, /^@@ -\d+,\d+ \+\d+,\d+ @@/m);
    assert.match(patch, /^-b$/m);
    assert.match(patch, /^\+B$/m);
  });

  it('is empty when nothing changed', () => {
    assert.equal(formatUnifiedPatch('x.ts', []), '');
  });
});

describe('buildEditDiff', () => {
  it('truncates an enormous patch and says so', () => {
    const before = Array.from({ length: 2000 }, (_, i) => `a-${i}`).join('\n');
    const after = Array.from({ length: 2000 }, (_, i) => `b-${i}`).join('\n');
    const r = buildEditDiff('big.ts', before, after, { maxPatchLines: 50 });
    assert.equal(r.patchTruncated, true);
    assert.match(r.patch, /diff truncated/);
  });
});

describe('file tools return structured diffs', () => {
  let dir;

  before(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dome-diff-')));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('file_edit reports added/removed counts and hunks', async () => {
    const file = path.join(dir, 'edit.txt');
    fs.writeFileSync(file, lines('one', 'two', 'three'), 'utf8');
    const res = await fileEdit({ file_path: file, edits: [{ oldText: 'two', newText: 'TWO' }] });
    assert.equal(res.status, 'success');
    assert.equal(res.lines_added, 1);
    assert.equal(res.lines_removed, 1);
    assert.equal(res.first_changed_line, 2);
    assert.ok(Array.isArray(res.diff_hunks) && res.diff_hunks.length === 1);
    assert.match(res.diff, /^\+TWO$/m);
  });

  it('file_edit preserves CRLF line endings', async () => {
    const file = path.join(dir, 'crlf.txt');
    fs.writeFileSync(file, 'one\r\ntwo\r\nthree', 'utf8');
    const res = await fileEdit({ file_path: file, edits: [{ oldText: 'two', newText: 'TWO' }] });
    assert.equal(res.status, 'success');
    assert.match(fs.readFileSync(file, 'utf8'), /one\r\nTWO\r\nthree/);
  });

  it('file_write creates a file and counts every line as added', async () => {
    const file = path.join(dir, 'new', 'created.txt');
    const res = await fileWrite({ file_path: file, content: lines('a', 'b', 'c') });
    assert.equal(res.status, 'success');
    assert.equal(res.created, true);
    assert.equal(res.lines_added, 3);
    assert.equal(res.lines_removed, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), lines('a', 'b', 'c'));
  });

  it('file_write diffs against the previous content', async () => {
    const file = path.join(dir, 'rewrite.txt');
    fs.writeFileSync(file, lines('a', 'b', 'c'), 'utf8');
    const res = await fileWrite({ file_path: file, content: lines('a', 'B', 'c') });
    assert.equal(res.created, false);
    assert.equal(res.lines_added, 1);
    assert.equal(res.lines_removed, 1);
  });

  it('file_write is a no-op when content is identical', async () => {
    const file = path.join(dir, 'same.txt');
    fs.writeFileSync(file, 'unchanged', 'utf8');
    const res = await fileWrite({ file_path: file, content: 'unchanged' });
    assert.equal(res.unchanged, true);
    assert.match(res.notice, /already had this exact content/);
  });

  it('file_write rejects a missing path', async () => {
    const res = await fileWrite({ content: 'x' });
    assert.equal(res.status, 'error');
  });
});
