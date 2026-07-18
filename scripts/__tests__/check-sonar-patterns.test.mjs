/**
 * Unit tests for Sonar pattern detectors (P-011).
 * Run: pnpm run test:sonar-patterns
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ALL_RULES,
  PROGRESSIVE_RULES,
  STRICT_RULES,
  annotateLines,
  scanFile,
} from '../check-sonar-patterns.mjs';

function writeTemp(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-pat-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

describe('STRICT_RULES', () => {
  it('flags String(...) ??', () => {
    const file = writeTemp('a.ts', 'const x = String(id) ?? null;\n');
    const hits = scanFile(file, STRICT_RULES);
    assert.ok(hits.some((h) => h.id === 'string-nullish'));
  });

  it('flags .sort() without compare', () => {
    const file = writeTemp('b.cjs', 'const a = list.sort();\n');
    const hits = scanFile(file, STRICT_RULES);
    assert.ok(hits.some((h) => h.id === 'sort-no-compare'));
  });

  it('allows .sort with localeCompare', () => {
    const file = writeTemp('c.ts', "keys.sort((a, b) => a.localeCompare(b));\n");
    const hits = scanFile(file, STRICT_RULES);
    assert.equal(hits.filter((h) => h.id === 'sort-no-compare').length, 0);
  });

  it('flags $1 replace without capturing group', () => {
    const file = writeTemp(
      'd.ts',
      "s.replace(/\\[[^\\]]*]\\([^)]*\\)/g, '$1');\n",
    );
    const hits = scanFile(file, STRICT_RULES);
    assert.ok(hits.some((h) => h.id === 'replace-dollar-without-group'));
  });

  it('allows $1 when regex has a group', () => {
    const file = writeTemp(
      'e.ts',
      "s.replace(/\\[([^\\]]*)]\\([^)]*\\)/g, '$1');\n",
    );
    const hits = scanFile(file, STRICT_RULES);
    assert.equal(hits.filter((h) => h.id === 'replace-dollar-without-group').length, 0);
  });
});

describe('PROGRESSIVE_RULES', () => {
  it('flags void arrow', () => {
    const file = writeTemp('f.tsx', 'onClick={() => void save()}\n');
    const hits = scanFile(file, PROGRESSIVE_RULES);
    assert.ok(hits.some((h) => h.id === 'void-arrow'));
  });

  it('flags require(fs) without node:', () => {
    const file = writeTemp('g.cjs', "const fs = require('fs');\n");
    // allowPath skips non-electron — simulate under electron via rewriting scan
    // scanFile uses real path; put file content check via rule.test directly
    const rule = PROGRESSIVE_RULES.find((r) => r.id === 'node-builtin-require');
    assert.ok(rule.test("const fs = require('fs');", { rel: 'electron/x.cjs', lineNo: 1, line: '', inTemplate: false }));
    assert.equal(rule.test("const fs = require('node:fs');", { rel: 'electron/x.cjs', lineNo: 1, line: '', inTemplate: false }), false);
  });

  it('flags identical ternary', () => {
    const file = writeTemp('h.ts', 'const o = cond ? value : value;\nconst n = x ? 1 : 1;\n');
    const hits = scanFile(file, PROGRESSIVE_RULES);
    assert.ok(hits.some((h) => h.id === 'identical-ternary'));
  });

  it('flags numeric JSX && leak', () => {
    const file = writeTemp('i.tsx', '{item.total_pages && (\n');
    const hits = scanFile(file, PROGRESSIVE_RULES);
    assert.ok(hits.some((h) => h.id === 'jsx-numeric-and'));
  });

  it('allows !!total_pages &&', () => {
    const file = writeTemp('j.tsx', '{!!item.total_pages && (\n');
    const hits = scanFile(file, PROGRESSIVE_RULES);
    assert.equal(hits.filter((h) => h.id === 'jsx-numeric-and').length, 0);
  });
});

describe('annotateLines', () => {
  it('splits source into lines', () => {
    const rows = annotateLines('const s = 1;\nconst y = 2;');
    assert.ok(rows.length >= 2);
    assert.equal(rows[0].lineNo, 1);
    assert.equal(rows[1].lineNo, 2);
  });
});

describe('rule catalog', () => {
  it('exports unique rule ids', () => {
    const ids = ALL_RULES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
