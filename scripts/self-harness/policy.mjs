import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_LIMITS,
  DENIED_PREFIXES,
  EDITABLE_FILES,
  EDITABLE_PREFIXES,
} from './constants.mjs';

export function normalizeRepoPath(input) {
  const normalized = String(input || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || normalized === '..') {
    throw new Error(`Unsafe repository path: ${input}`);
  }
  return normalized;
}

export function isEditablePath(input) {
  const filePath = normalizeRepoPath(input);
  if (DENIED_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return false;
  return EDITABLE_FILES.includes(filePath) || EDITABLE_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

export function extractPatchStats(patch) {
  const files = new Set();
  let additions = 0;
  let deletions = 0;
  for (const line of String(patch || '').split('\n')) {
    if (line.startsWith('+++ b/') || line.startsWith('--- a/')) {
      const raw = line.slice(6).trim();
      if (raw !== '/dev/null') files.add(normalizeRepoPath(raw));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }
  return { files: [...files].sort(), additions, deletions, changedLines: additions + deletions };
}

export function validatePatch(patch, limits = DEFAULT_LIMITS) {
  const reasons = [];
  const patchText = String(patch || '');
  if (!patchText.trim()) reasons.push('empty patch');
  if (/GIT binary patch|(?:new|old) file mode 120000|(?:new|old) file mode 160000/.test(patchText)) {
    reasons.push('binary, symlink, and submodule patches are forbidden');
  }
  const stats = extractPatchStats(patch);
  if (stats.files.length === 0) reasons.push('patch contains no files');
  if (stats.files.length > limits.maxFiles) reasons.push(`too many files: ${stats.files.length} > ${limits.maxFiles}`);
  if (stats.changedLines > limits.maxChangedLines) reasons.push(`too many changed lines: ${stats.changedLines} > ${limits.maxChangedLines}`);
  for (const filePath of stats.files) {
    if (!isEditablePath(filePath)) reasons.push(`path is outside editable harness surface: ${filePath}`);
  }
  return { valid: reasons.length === 0, reasons, stats };
}

function assertReadablePath(repoRoot, requestedPath) {
  const relative = normalizeRepoPath(requestedPath);
  if (!isEditablePath(relative)) throw new Error(`Read denied outside editable harness surface: ${relative}`);
  const absolute = path.resolve(repoRoot, relative);
  const rootWithSep = `${path.resolve(repoRoot)}${path.sep}`;
  if (!absolute.startsWith(rootWithSep)) throw new Error(`Read escaped repository root: ${relative}`);
  return { relative, absolute };
}

export function repoRead(repoRoot, requestedPath, startLine = 1, endLine = 300) {
  const { relative, absolute } = assertReadablePath(repoRoot, requestedPath);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`Not a file: ${relative}`);
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.min(start + 399, Math.max(start, Number(endLine) || start + 299));
  const lines = fs.readFileSync(absolute, 'utf8').split('\n');
  return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join('\n');
}

export function repoSearch(repoRoot, query, requestedPath = 'packages/agent-core/src/') {
  if (!String(query || '').trim()) throw new Error('Search query is required');
  const { absolute } = assertReadablePath(repoRoot, requestedPath);
  const result = spawnSync('rg', ['-n', '--max-count', '80', '--', String(query), absolute], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  if (![0, 1].includes(result.status)) throw new Error(`repo_search failed: ${result.stderr.trim()}`);
  return (result.stdout || '').split('\n').slice(0, 120).join('\n');
}
