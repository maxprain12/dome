import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  evaluateIssueEligibility,
  filterEligibleIssues,
  formatBatchPrTitle,
  fastGatesAllowPr,
  isOpenSonarStatus,
  isStaleSonarHash,
  sonarLineHash,
} from '../batch-eligibility.mjs';

describe('isOpenSonarStatus', () => {
  it('accepts OPEN/CONFIRMED/REOPENED and unknown', () => {
    assert.equal(isOpenSonarStatus('OPEN'), true);
    assert.equal(isOpenSonarStatus('CONFIRMED'), true);
    assert.equal(isOpenSonarStatus('REOPENED'), true);
    assert.equal(isOpenSonarStatus(undefined), true);
    assert.equal(isOpenSonarStatus('CLOSED'), false);
    assert.equal(isOpenSonarStatus('RESOLVED'), false);
  });
});

describe('sonarLineHash / isStaleSonarHash', () => {
  it('matches MD5 of the line content', () => {
    const line = 'function syncBlobs() {';
    assert.equal(sonarLineHash(line), crypto.createHash('md5').update(line, 'utf8').digest('hex'));
  });

  it('detects stale hash when disk line differs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-elig-'));
    const rel = 'electron/storage/blob-sync.cjs';
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'line1\ncurrent code\nline3\n');
    const issue = {
      hash: sonarLineHash('old code from july'),
      line: 2,
      component: `proj:${rel}`,
    };
    assert.equal(isStaleSonarHash(issue, dir), true);
    const fresh = { ...issue, hash: sonarLineHash('current code') };
    assert.equal(isStaleSonarHash(fresh, dir), false);
  });

  it('treats missing line as stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-elig-'));
    const rel = 'a.cjs';
    fs.writeFileSync(path.join(dir, rel), 'only one line\n');
    assert.equal(
      isStaleSonarHash({ hash: 'abc', line: 99, component: `proj:${rel}` }, dir),
      true,
    );
  });
});

describe('evaluateIssueEligibility', () => {
  it('skips non-open Sonar status and FIXED resolution', () => {
    const ctx = {
      repoRoot: process.cwd(),
      closedSonarKeys: new Set(),
      mergedPrSonarKeys: new Set(),
      recentFixDays: 30,
      gitDeps: { execFileSync: () => '' },
    };
    assert.equal(
      evaluateIssueEligibility({ key: 'k1', status: 'CLOSED' }, ctx).skip,
      true,
    );
    assert.equal(
      evaluateIssueEligibility({ key: 'k2', status: 'OPEN', resolution: 'FIXED' }, ctx).skip,
      true,
    );
  });

  it('skips keys closed on GitHub or cited by merged PR', () => {
    const ctx = {
      repoRoot: process.cwd(),
      closedSonarKeys: new Set(['closed-key']),
      mergedPrSonarKeys: new Set(['merged-key']),
      recentFixDays: 30,
      gitDeps: { execFileSync: () => '' },
    };
    assert.deepEqual(evaluateIssueEligibility({ key: 'closed-key', status: 'OPEN' }, ctx), {
      skip: true,
      reason: 'github_issue_closed',
    });
    assert.deepEqual(evaluateIssueEligibility({ key: 'merged-key', status: 'OPEN' }, ctx), {
      skip: true,
      reason: 'merged_pr_cites_key',
    });
  });

  it('skips when file recently touched by fix(sonar)', () => {
    const ctx = {
      repoRoot: '/repo',
      closedSonarKeys: new Set(),
      mergedPrSonarKeys: new Set(),
      recentFixDays: 30,
      gitDeps: {
        execFileSync: () => 'abc123\n',
      },
    };
    const r = evaluateIssueEligibility(
      {
        key: 'k',
        status: 'OPEN',
        component: 'proj:electron/storage/blob-sync.cjs',
      },
      ctx,
    );
    assert.equal(r.skip, true);
    assert.equal(r.reason, 'recent_fix_sonar_on_file');
  });

  it('keeps actionable open issues', () => {
    const ctx = {
      repoRoot: process.cwd(),
      closedSonarKeys: new Set(),
      mergedPrSonarKeys: new Set(),
      recentFixDays: 30,
      gitDeps: { execFileSync: () => '' },
    };
    const r = evaluateIssueEligibility(
      {
        key: 'fresh',
        status: 'OPEN',
        rule: 'javascript:S3776',
        component: 'proj:app/missing-no-hash.ts',
      },
      ctx,
    );
    assert.equal(r.skip, false);
  });
});

describe('filterEligibleIssues', () => {
  it('returns kept + skipped with reasons', () => {
    const ctx = {
      repoRoot: process.cwd(),
      closedSonarKeys: new Set(['gone']),
      mergedPrSonarKeys: new Set(),
      recentFixDays: 30,
      gitDeps: { execFileSync: () => '' },
    };
    const { kept, skipped } = filterEligibleIssues(
      [
        { key: 'gone', status: 'OPEN' },
        { key: 'keep', status: 'OPEN', component: 'proj:x.ts' },
      ],
      ctx,
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].key, 'keep');
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, 'github_issue_closed');
  });
});

describe('formatBatchPrTitle', () => {
  it('includes rule + file for issue batches', () => {
    assert.equal(
      formatBatchPrTitle({
        batch: [
          {
            rule: 'javascript:S3776',
            component: 'proj:electron/storage/blob-sync.cjs',
          },
        ],
      }),
      'fix(sonar): S3776 blob-sync.cjs',
    );
    assert.equal(
      formatBatchPrTitle({
        batch: [
          { rule: 'javascript:S3776', component: 'proj:a.cjs' },
          { rule: 'javascript:S3776', component: 'proj:b.cjs' },
        ],
      }),
      'fix(sonar): S3776 a.cjs (+1)',
    );
  });

  it('formats coverage titles', () => {
    assert.equal(
      formatBatchPrTitle({
        kind: 'coverage',
        batch: [{ component: 'proj:app/lib/foo.ts' }],
      }),
      'test(sonar): coverage foo.ts',
    );
  });
});

describe('fastGatesAllowPr', () => {
  it('requires overall === pass', () => {
    assert.equal(fastGatesAllowPr(null), false);
    assert.equal(fastGatesAllowPr({ overall: 'fail' }), false);
    assert.equal(fastGatesAllowPr({ overall: 'unknown' }), false);
    assert.equal(fastGatesAllowPr({ overall: 'pass' }), true);
  });
});
