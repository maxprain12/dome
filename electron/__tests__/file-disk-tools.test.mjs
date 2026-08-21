/**
 * Native disk file tools + HITL allowlist + tool-output truncate.
 * Run: node --test electron/__tests__/file-disk-tools.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  truncateHead,
  truncateTail,
  DEFAULT_MAX_BYTES,
} = require('../tools/tool-output-truncate.cjs');
const {
  fileRead,
  fileGrep,
  fileFind,
  fileEdit,
  resolveReadOffset,
} = require('../tools/file-disk-tools.cjs');
const hitlAllowlist = require('../agents/hitl-allowlist.cjs');
const { capToolResultString, getCapForTool } = require('../tools/tool-result-cap.cjs');

describe('tool-output-truncate', () => {
  it('truncateHead keeps under 50KB / 2000 lines', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line-${i} ${'x'.repeat(40)}`).join('\n');
    const r = truncateHead(big);
    assert.equal(r.truncated, true);
    assert.ok(r.outputBytes <= DEFAULT_MAX_BYTES || r.outputLines <= 2000);
  });

  it('truncateTail keeps the end', () => {
    const big = `${Array.from({ length: 100 }, (_, i) => `L${i}`).join('\n')}\nTAIL_MARKER`;
    const r = truncateTail(big, { maxLines: 5, maxBytes: 10_000 });
    assert.equal(r.truncated, true);
    assert.match(r.content, /TAIL_MARKER/);
  });
});

describe('fileRead pagination', () => {
  let dir;
  let file;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-file-read-'));
    file = path.join(dir, 'sample.txt');
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`);
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('maps legacy start_line 0-based to offset', () => {
    assert.equal(resolveReadOffset({ start_line: 0 }), 1);
    assert.equal(resolveReadOffset({ start_line: 9 }), 10);
    assert.equal(resolveReadOffset({ offset: 5 }), 5);
  });

  it('honors offset + limit', async () => {
    const r = await fileRead({ file_path: file, offset: 10, limit: 5 });
    assert.equal(r.status, 'success');
    assert.equal(r.offset, 10);
    assert.equal(r.end_line, 14);
    assert.equal(r.total_lines, 50);
    assert.match(r.content, /^line-10/);
    assert.match(r.content, /line-14$/);
    assert.ok(!r.content.includes('line-15'));
  });

  it('does not dump whole file when paginated', async () => {
    const r = await fileRead({ file_path: file, start_line: 0, limit: 3 });
    assert.equal(r.status, 'success');
    assert.ok(r.content.split('\n').length <= 3);
    assert.ok(r.notice);
  });
});

describe('fileEdit', () => {
  let dir;
  let file;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-file-edit-'));
    file = path.join(dir, 'edit-me.js');
    fs.writeFileSync(file, 'const a = 1;\nconst b = 2;\n', 'utf8');
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies unique oldText replacement', async () => {
    const r = await fileEdit({
      file_path: file,
      edits: [{ oldText: 'const b = 2;', newText: 'const b = 3;' }],
    });
    assert.equal(r.status, 'success');
    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /const b = 3;/);
    assert.ok(r.diff);
  });
});

describe('fileGrep / fileFind', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-grep-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const hello = 1;\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'export const world = 2;\n', 'utf8');
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fileGrep returns line matches', async () => {
    const r = await fileGrep({ pattern: 'hello', path: dir, limit: 10 });
    assert.equal(r.status, 'success');
    assert.ok(r.count >= 1);
    assert.match(r.content, /hello/);
    assert.match(r.content, /:\d+:/);
  });

  it('fileFind returns paths', async () => {
    const r = await fileFind({ pattern: '*.ts', path: dir, limit: 50 });
    assert.equal(r.status, 'success');
    assert.ok(r.count >= 2);
  });
});

describe('HITL allowlist', () => {
  after(() => {
    hitlAllowlist.clearAll();
  });

  it('approveAllForThread auto-approves tools', () => {
    hitlAllowlist.clearAll();
    assert.equal(hitlAllowlist.isToolAutoApproved('t1', 'shell_exec'), false);
    hitlAllowlist.approveAllForThread('t1', '*');
    assert.equal(hitlAllowlist.isToolAutoApproved('t1', 'shell_exec'), true);
    assert.equal(hitlAllowlist.isToolAutoApproved('t1', 'email_send'), true);
    assert.equal(hitlAllowlist.isToolAutoApproved('other', 'shell_exec'), false);
  });
});

describe('tool result soft caps', () => {
  it('caps shell_exec and file_read', () => {
    assert.ok(getCapForTool('shell_exec') <= 48_000);
    assert.ok(getCapForTool('file_grep') <= 48_000);
    const huge = 'x'.repeat(200_000);
    const capped = capToolResultString('shell_exec', huge);
    assert.ok(capped.length < huge.length);
    assert.match(capped, /truncated/i);
  });
});

describe('fileSearch literal parentheses', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-file-search-'));
    fs.writeFileSync(path.join(dir, 'lib.js'), 'async function importFileToLibrary(args = {}) {\n', 'utf8');
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not throw on patterns with parentheses', async () => {
    // Load handler lazily — only needs fileSearch.
    const { fileSearch } = require('../tools/ai-tools-handler.cjs');
    const r = await fileSearch({
      directory: dir,
      pattern: 'importFileToLibrary(',
      type: 'content',
    });
    assert.equal(r.status, 'success');
    assert.ok(r.count >= 1);
    assert.ok(r.matches.some((m) => m.name === 'lib.js'));
  });
});
