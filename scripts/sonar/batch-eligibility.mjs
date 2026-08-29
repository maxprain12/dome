/**
 * Pure helpers: decide whether a Sonar/GitHub issue is still worth fixing.
 * Used by pick-batch (and unit-tested without live APIs).
 */

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { componentToRelativePath } from './lib.mjs';

export const OPEN_SONAR_STATUSES = new Set(['OPEN', 'CONFIRMED', 'REOPENED']);

/** Default lookback for "recently touched by fix(sonar)" on main. */
export const DEFAULT_RECENT_FIX_DAYS = 30;

/**
 * Sonar stores MD5 of the source line with spaces/tabs removed
 * (SourceLineHashesComputer: StringUtils.replaceChars(line, "\t ", "")).
 * @param {string} lineContent
 */
export function sonarLineHash(lineContent) {
  const reduced = String(lineContent).replace(/[\t ]/g, '');
  if (!reduced) return '';
  return crypto.createHash('md5').update(reduced, 'utf8').digest('hex');
}

/**
 * @param {string | undefined | null} status
 */
export function isOpenSonarStatus(status) {
  if (!status) return true; // unknown → keep (e.g. GH-only row without Sonar enrich)
  return OPEN_SONAR_STATUSES.has(String(status).toUpperCase());
}

/**
 * @param {string} filePath absolute or relative
 * @param {number} line 1-based
 * @returns {string | null}
 */
export function readFileLine(filePath, line) {
  if (!filePath || !line || line < 1) return null;
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (line > lines.length) return null;
  return lines[line - 1] ?? null;
}

/**
 * True when Sonar issue.hash no longer matches the current line on disk
 * (stale analysis after a local refactor). Missing hash/line → not a mismatch.
 * @param {{ hash?: string, line?: number, component?: string }} issue
 * @param {string} repoRoot
 */
export function isStaleSonarHash(issue, repoRoot) {
  const expected = issue.hash ? String(issue.hash) : '';
  const line = Number(issue.line);
  if (!expected || !line) return false;
  const rel = componentToRelativePath(String(issue.component || ''));
  if (!rel) return false;
  const abs = path.resolve(repoRoot, rel);
  const content = readFileLine(abs, line);
  if (content === null) return true; // line gone → treat as stale
  return sonarLineHash(content) !== expected;
}

/**
 * @param {string} repoRoot
 * @param {string} relFile
 * @param {number} [sinceDays]
 * @param {{ execFileSync?: typeof execFileSync }} [deps]
 */
export function fileRecentlyFixedBySonar(
  repoRoot,
  relFile,
  sinceDays = DEFAULT_RECENT_FIX_DAYS,
  deps = {},
) {
  const file = String(relFile || '').trim();
  if (!file) return false;
  const run = deps.execFileSync || execFileSync;
  const since = `${Math.max(1, Number(sinceDays) || DEFAULT_RECENT_FIX_DAYS)} days ago`;
  try {
    const out = run(
      'git',
      ['log', '-1', '--format=%H', `--since=${since}`, '--grep=fix(sonar)', '-i', '--', file],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return Boolean(String(out).trim());
  } catch {
    return false;
  }
}

/**
 * @typedef {object} EligibilityContext
 * @property {string} repoRoot
 * @property {Set<string>} closedSonarKeys keys with a closed GitHub sonar issue
 * @property {Set<string>} mergedPrSonarKeys keys cited by a merged PR body/title
 * @property {number} [recentFixDays]
 * @property {{ execFileSync?: typeof execFileSync }} [gitDeps]
 */

/**
 * @param {Record<string, unknown>} issue
 * @param {EligibilityContext} ctx
 * @returns {{ skip: boolean, reason?: string }}
 */
export function evaluateIssueEligibility(issue, ctx) {
  const key = String(issue.key || issue.sonarKey || '');
  const status = issue.status != null ? String(issue.status) : undefined;
  const resolution = issue.resolution != null ? String(issue.resolution) : undefined;

  if (resolution && ['FIXED', 'FALSE-POSITIVE', 'WONTFIX', 'REMOVED'].includes(resolution.toUpperCase())) {
    return { skip: true, reason: `sonar_resolution_${resolution.toLowerCase()}` };
  }

  if (!isOpenSonarStatus(status)) {
    return { skip: true, reason: `sonar_status_${String(status).toLowerCase()}` };
  }

  if (key && ctx.closedSonarKeys?.has(key)) {
    return { skip: true, reason: 'github_issue_closed' };
  }

  if (key && ctx.mergedPrSonarKeys?.has(key)) {
    return { skip: true, reason: 'merged_pr_cites_key' };
  }

  if (isStaleSonarHash(/** @type {{ hash?: string, line?: number, component?: string }} */ (issue), ctx.repoRoot)) {
    return { skip: true, reason: 'stale_sonar_hash' };
  }

  const rel = componentToRelativePath(String(issue.component || ''));
  if (
    rel &&
    fileRecentlyFixedBySonar(ctx.repoRoot, rel, ctx.recentFixDays, ctx.gitDeps)
  ) {
    return { skip: true, reason: 'recent_fix_sonar_on_file' };
  }

  return { skip: false };
}

/**
 * @param {Array<Record<string, unknown>>} issues
 * @param {EligibilityContext} ctx
 */
export function filterEligibleIssues(issues, ctx) {
  /** @type {Array<Record<string, unknown>>} */
  const kept = [];
  /** @type {Array<{ key: string, reason: string }>} */
  const skipped = [];
  for (const issue of issues) {
    const { skip, reason } = evaluateIssueEligibility(issue, ctx);
    if (skip) {
      skipped.push({
        key: String(issue.key || issue.sonarKey || '?'),
        reason: reason || 'unknown',
      });
      continue;
    }
    kept.push(issue);
  }
  return { kept, skipped };
}

/**
 * Build a distinctive PR title from the first batch issue.
 * @param {{ kind?: string, batch?: Array<Record<string, unknown>> }} batch
 */
export function formatBatchPrTitle(batch) {
  if (batch.kind === 'coverage') {
    const first = batch.batch?.[0];
    const file = componentToRelativePath(String(first?.component || ''));
    const base = file.split('/').pop() || file || 'batch';
    const extra = (batch.batch?.length || 0) > 1 ? ` (+${(batch.batch?.length || 1) - 1})` : '';
    return `test(sonar): coverage ${base}${extra}`;
  }
  const first = batch.batch?.[0];
  if (!first) return 'fix(sonar): quality loop batch';
  const rule = String(first.rule || 'unknown');
  const ruleShort = rule.includes(':') ? rule.split(':').pop() : rule;
  const file = componentToRelativePath(String(first.component || ''));
  const base = file.split('/').pop() || file || 'batch';
  const extra = (batch.batch?.length || 0) > 1 ? ` (+${(batch.batch?.length || 1) - 1})` : '';
  return `fix(sonar): ${ruleShort} ${base}${extra}`;
}

/**
 * PR creation must not proceed unless Fast gates reported pass.
 * @param {{ overall?: string } | null | undefined} fastGates
 */
export function fastGatesAllowPr(fastGates) {
  return Boolean(fastGates && fastGates.overall === 'pass');
}
