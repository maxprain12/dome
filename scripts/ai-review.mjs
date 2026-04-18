#!/usr/bin/env node
/**
 * AI Code Review Script for Dome
 *
 * Reads a git diff from stdin, runs 3 structured review passes (architecture,
 * logic, style) per file, and posts a GitHub PR review with line-level
 * comments anchored to the diff.
 *
 * Prompts live in `prompts/review/*.md` (externalized — previously inline).
 * Shared project context (`prompts/shared/project-context.md`) is prepended to
 * every pass's system prompt so severity/quality rules apply to PR reviews too.
 * Diffs are split by file so large PRs are fully covered (no 40KB truncation).
 * Model replies are strict JSON (`{ findings: [...] }`); fallbacks are robust.
 *
 * Config via env vars:
 *   AI_REVIEW_API_KEY       - API key (required)
 *   AI_REVIEW_BASE_URL      - Base URL (default: https://api.openai.com/v1)
 *   AI_REVIEW_MODEL         - Model name (default: gpt-4o)
 *   AI_REVIEW_CONCURRENCY   - Max concurrent AI calls (default: 5)
 *   AI_REVIEW_MAX_FILE_KB   - Max size per file chunk before per-file truncation (default: 60)
 *   AI_REVIEW_IGNORE_GLOBS  - Comma-separated file patterns to skip
 *   AI_REVIEW_DRY_RUN       - "1" prints the review body without posting
 *   GITHUB_TOKEN            - GitHub token for posting review (required in CI)
 *   PR_NUMBER               - PR number (set by GitHub Actions)
 *   REPO                    - owner/repo (set by GitHub Actions)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const API_KEY = process.env.AI_REVIEW_API_KEY;
const BASE_URL = (process.env.AI_REVIEW_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_REVIEW_MODEL || 'gpt-4o';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;

const CONCURRENCY = Math.max(1, parseInt(process.env.AI_REVIEW_CONCURRENCY || '5', 10));
const MAX_FILE_KB = Math.max(10, parseInt(process.env.AI_REVIEW_MAX_FILE_KB || '60', 10));
const MAX_FILE_BYTES = MAX_FILE_KB * 1024;
const DRY_RUN = process.env.AI_REVIEW_DRY_RUN === '1' || process.argv.includes('--dry-run');

const DEFAULT_IGNORE = [
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'yarn.lock',
  'pnpm-lock.yaml',
  'dist/',
  'out/',
  'build/',
  'node_modules/',
  '.min.js',
  '.min.css',
  '.map',
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.pdf',
  '.woff',
  '.woff2',
];
const IGNORE_GLOBS = (process.env.AI_REVIEW_IGNORE_GLOBS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const IGNORE = [...DEFAULT_IGNORE, ...IGNORE_GLOBS];

const CALL_TIMEOUT_MS = 50_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 6_000;

if (!API_KEY && !DRY_RUN) {
  console.error('❌ AI_REVIEW_API_KEY is required (or set AI_REVIEW_DRY_RUN=1)');
  process.exit(1);
}

// ── Read diff from stdin ──────────────────────────────────────────────────────

let diff = '';
try {
  diff = readFileSync('/dev/stdin', 'utf-8');
} catch {
  process.stderr.write('Reading diff from stdin...\n');
}

if (!diff || diff.trim().length < 50) {
  console.log('ℹ️  Diff too small to review. Skipping.');
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^(\s*\n)+/, '')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIgnored(path) {
  return IGNORE.some((pattern) => {
    if (pattern.endsWith('/')) return path.startsWith(pattern) || path.includes(`/${pattern}`);
    return path.endsWith(pattern) || path.includes(pattern);
  });
}

/**
 * Split a unified diff into per-file chunks.
 * Returns [{ path, diff, newLineSet: Set<number>, isBinary }].
 */
function splitDiffByFile(raw) {
  const files = [];
  const lines = raw.split('\n');
  let current = null;

  const flush = () => {
    if (!current) return;
    const lineSet = new Set();
    let newLine = 0;
    let inHunk = false;
    for (const l of current.lines) {
      const hunk = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        newLine = parseInt(hunk[1], 10);
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;
      if (l.startsWith('+') && !l.startsWith('+++')) {
        lineSet.add(newLine);
        newLine += 1;
      } else if (l.startsWith('-') && !l.startsWith('---')) {
        // deletion — old-side line, don't advance new-side counter
      } else if (l.startsWith(' ')) {
        lineSet.add(newLine);
        newLine += 1;
      } else if (l.startsWith('\\')) {
        // "\ No newline at end of file"
      }
    }
    current.newLineSet = lineSet;
    current.diff = current.lines.join('\n');
    delete current.lines;
    files.push(current);
    current = null;
  };

  for (const l of lines) {
    const header = l.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      flush();
      current = { path: header[2], oldPath: header[1], lines: [l], isBinary: false };
      continue;
    }
    if (!current) continue;
    if (l.startsWith('Binary files ') || l.startsWith('GIT binary patch')) {
      current.isBinary = true;
    }
    current.lines.push(l);
  }
  flush();

  return files;
}

function truncateFileDiff(fileChunk) {
  if (fileChunk.diff.length <= MAX_FILE_BYTES) return { truncated: false, chunk: fileChunk };
  const truncated = {
    ...fileChunk,
    diff: fileChunk.diff.slice(0, MAX_FILE_BYTES) + '\n\n[... file diff truncated for length ...]',
  };
  return { truncated: true, chunk: truncated };
}

// ── Prompt loading ────────────────────────────────────────────────────────────

function stripFrontmatter(md) {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).replace(/^\n+/, '');
}

function readFrontmatterField(md, field) {
  const match = md.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : '';
}

const FALLBACK_PROMPTS = {
  architecture:
    'Review the diff for architecture violations. Respond with JSON: {"findings":[{"file":"","line":0,"severity":"error","comment":""}]}.',
  logic:
    'Review the diff for logic bugs and security issues. Respond with JSON: {"findings":[{"file":"","line":0,"severity":"error","comment":""}]}.',
  style:
    'Review the diff for style issues. Respond with JSON: {"findings":[{"file":"","line":0,"severity":"warn","comment":""}]}.',
};

function loadPrompt(name) {
  const path = join(REPO_ROOT, 'prompts', 'review', `${name}.md`);
  try {
    const raw = readFileSync(path, 'utf-8');
    const version = readFrontmatterField(raw, 'version') || '0';
    const body = stripFrontmatter(raw);
    return { body, version, source: path };
  } catch {
    return { body: FALLBACK_PROMPTS[name] || FALLBACK_PROMPTS.architecture, version: 'fallback', source: 'builtin' };
  }
}

function loadSharedContext() {
  const path = join(REPO_ROOT, 'prompts', 'shared', 'project-context.md');
  try {
    const raw = readFileSync(path, 'utf-8');
    const version = readFrontmatterField(raw, 'version') || '0';
    const body = stripFrontmatter(raw);
    return { body, version, source: path };
  } catch {
    return { body: '', version: 'missing', source: 'none' };
  }
}

// ── AI call with retry/timeout ────────────────────────────────────────────────

async function callAI(systemPrompt, userContent, { wantJson = true } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * attempt;
      await sleep(delay);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('AI call timed out')), CALL_TIMEOUT_MS);
      let response;
      try {
        const body = {
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        };
        if (wantJson) body.response_format = { type: 'json_object' };
        response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // Some providers reject response_format — retry without it
        if (wantJson && (response.status === 400 || text.includes('response_format'))) {
          wantJson = false;
          throw new Error(`response_format unsupported, retrying plain (status ${response.status})`);
        }
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      if (!raw) throw new Error('Empty response from model');
      return stripThinking(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Parse a model response into { findings: [...] }. Tolerant of markdown fences. */
function parseFindings(text) {
  if (!text) return { findings: [], parseError: 'empty' };
  const tries = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean);
  for (const candidate of tries) {
    try {
      const obj = JSON.parse(candidate);
      const findings = Array.isArray(obj.findings) ? obj.findings : Array.isArray(obj) ? obj : [];
      return { findings: findings.filter((f) => f && typeof f === 'object'), parseError: null };
    } catch {
      // try next
    }
  }
  return { findings: [], parseError: 'invalid-json' };
}

// ── Concurrency-limited mapper ────────────────────────────────────────────────

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PASSES = [
  { key: 'architecture', label: 'Architecture & Process Separation' },
  { key: 'logic', label: 'Logic & Security' },
  { key: 'style', label: 'Style & Conventions' },
];

async function main() {
  const sharedContext = loadSharedContext();
  const prompts = Object.fromEntries(PASSES.map((p) => [p.key, loadPrompt(p.key)]));
  const promptVersions = [
    `shared@${sharedContext.version}`,
    ...PASSES.map((p) => `${p.key}@${prompts[p.key].version}`),
  ].join(', ');

  const allFiles = splitDiffByFile(diff);
  const reviewedFiles = [];
  const skipped = [];
  const truncatedFiles = [];

  for (const f of allFiles) {
    if (f.isBinary) { skipped.push({ ...f, reason: 'binary' }); continue; }
    if (isIgnored(f.path)) { skipped.push({ ...f, reason: 'ignored' }); continue; }
    const { truncated, chunk } = truncateFileDiff(f);
    if (truncated) truncatedFiles.push(chunk.path);
    reviewedFiles.push(chunk);
  }

  console.log(`🤖 AI review — model=${MODEL}, concurrency=${CONCURRENCY}`);
  console.log(`   prompts: ${promptVersions}`);
  console.log(`   files: ${allFiles.length} total (${reviewedFiles.length} reviewed, ${skipped.length} skipped, ${truncatedFiles.length} clipped)`);

  // Build one task per (file × pass)
  const tasks = [];
  for (const file of reviewedFiles) {
    for (const pass of PASSES) {
      tasks.push({ file, pass });
    }
  }

  const taskFn = async ({ file, pass }) => {
    if (DRY_RUN) return { pass: pass.key, file: file.path, findings: [{ file: file.path, line: [...file.newLineSet][0] || 1, severity: 'warn', comment: `[dry-run fake finding from ${pass.key} pass]` }] };
    const userContent = `Review this file's diff chunk.\n\nFile: ${file.path}\n\n\`\`\`diff\n${file.diff}\n\`\`\``;
    const systemPrompt = sharedContext.body
      ? `${sharedContext.body}\n\n---\n\n${prompts[pass.key].body}`
      : prompts[pass.key].body;
    try {
      const raw = await callAI(systemPrompt, userContent);
      const { findings, parseError } = parseFindings(raw);
      return { pass: pass.key, file: file.path, findings, parseError };
    } catch (err) {
      return { pass: pass.key, file: file.path, findings: [], callError: err.message };
    }
  };

  const taskResults = await mapConcurrent(tasks, CONCURRENCY, taskFn);

  // Aggregate
  const allFindings = [];
  const passStats = Object.fromEntries(PASSES.map((p) => [p.key, { ok: 0, err: 0, findings: 0 }]));
  const callErrors = [];
  const parseErrors = [];

  for (const r of taskResults) {
    if (!r.ok) { callErrors.push(String(r.error)); continue; }
    const { pass, file, findings, callError, parseError } = r.value;
    if (callError) { passStats[pass].err++; callErrors.push(`${pass}:${file} — ${callError}`); continue; }
    passStats[pass].ok++;
    if (parseError) parseErrors.push(`${pass}:${file} — ${parseError}`);
    for (const f of findings) {
      allFindings.push({ ...f, pass, _file: file });
    }
    passStats[pass].findings += findings.length;
  }

  // Validate & shape findings
  const fileIndex = Object.fromEntries(reviewedFiles.map((f) => [f.path, f]));
  const reviewComments = [];
  const droppedForInvalidLine = [];
  const seenKey = new Set();

  for (const f of allFindings) {
    const path = typeof f.file === 'string' && f.file.trim() ? f.file.trim() : f._file;
    const line = Number.isInteger(f.line) ? f.line : parseInt(f.line, 10);
    const severity = f.severity === 'error' ? 'error' : 'warn';
    const comment = typeof f.comment === 'string' ? f.comment.trim() : '';
    if (!path || !comment) continue;
    const meta = fileIndex[path];
    if (!meta || !Number.isFinite(line) || !meta.newLineSet.has(line)) {
      droppedForInvalidLine.push({ path, line, comment });
      continue;
    }
    const dedupeKey = `${path}:${line}:${comment}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);
    const icon = severity === 'error' ? '❌' : '⚠️';
    const passLabel = PASSES.find((p) => p.key === f.pass)?.label || f.pass;
    reviewComments.push({
      path,
      line,
      side: 'RIGHT',
      body: `${icon} **${passLabel}** — ${comment}`,
    });
  }

  // Build summary body
  const totalFindings = reviewComments.length;
  const failedPasses = Object.entries(passStats).filter(([, s]) => s.err > 0);
  const statusLine =
    failedPasses.length === 0
      ? `✅ All passes completed across ${reviewedFiles.length} file(s)`
      : `⚠️ ${failedPasses.length}/${PASSES.length} pass(es) had errors — see below`;

  const summaryLines = [
    `## 🤖 AI Code Review`,
    ``,
    `> Model: \`${MODEL}\` · Prompts: \`${promptVersions}\` · ${statusLine}`,
    ``,
    `**Files:** ${reviewedFiles.length} reviewed · ${skipped.length} skipped · ${truncatedFiles.length} clipped`,
    `**Findings:** ${totalFindings} total`,
    ``,
    `| Pass | Files OK | Files errored | Findings |`,
    `| --- | --- | --- | --- |`,
    ...PASSES.map((p) => `| ${p.label} | ${passStats[p.key].ok} | ${passStats[p.key].err} | ${passStats[p.key].findings} |`),
    ``,
  ];

  if (truncatedFiles.length) {
    summaryLines.push(`<details><summary>Clipped files (${truncatedFiles.length})</summary>\n\n- ${truncatedFiles.join('\n- ')}\n\n</details>`, '');
  }
  if (skipped.length) {
    summaryLines.push(
      `<details><summary>Skipped files (${skipped.length})</summary>\n\n- ${skipped.map((s) => `${s.path} (${s.reason})`).join('\n- ')}\n\n</details>`,
      ''
    );
  }
  if (callErrors.length) {
    summaryLines.push(
      `<details><summary>API call errors (${callErrors.length})</summary>\n\n\`\`\`\n${callErrors.slice(0, 10).join('\n')}\n\`\`\`\n\n</details>`,
      ''
    );
  }
  if (parseErrors.length) {
    summaryLines.push(
      `<details><summary>Unparsable model responses (${parseErrors.length})</summary>\n\n\`\`\`\n${parseErrors.slice(0, 10).join('\n')}\n\`\`\`\n\n</details>`,
      ''
    );
  }
  if (droppedForInvalidLine.length) {
    summaryLines.push(
      `<details><summary>Dropped findings (line not in diff) — ${droppedForInvalidLine.length}</summary>\n\n` +
        droppedForInvalidLine.slice(0, 15).map((d) => `- ❌ \`${d.path}:${d.line}\` — ${d.comment}`).join('\n') +
        `\n\n</details>`,
      ''
    );
  }
  summaryLines.push(`---`, `<sub>Line-level comments anchored to the diff. Automated sanity check — not a final verdict.</sub>`);

  const reviewBody = summaryLines.join('\n');

  if (DRY_RUN || !GITHUB_TOKEN || !PR_NUMBER || !REPO) {
    console.log('\n--- Review Output (dry run / local) ---\n');
    console.log(reviewBody);
    console.log(`\n--- ${reviewComments.length} line comments would be posted ---`);
    for (const c of reviewComments.slice(0, 20)) {
      console.log(`  ${c.path}:${c.line} — ${c.body}`);
    }
    if (reviewComments.length > 20) console.log(`  ... and ${reviewComments.length - 20} more`);
    if (failedPasses.length === PASSES.length) process.exit(1);
    return;
  }

  // Post to GitHub with Retry-After-aware backoff. Secondary rate limits
  // (403 with "secondary rate limit" in body) fire when this PR's autosync +
  // auto-merge + this review land in the same minute — they're recoverable.
  const ghPost = async (targetUrl, payload, attemptsLeft = 4, backoffSec = 30) => {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    const rateLimited =
      res.status === 429 ||
      (res.status === 403 && /secondary rate limit|abuse|rate limit/i.test(text));
    if (rateLimited && attemptsLeft > 0) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffSec;
      console.error(`⏳ Rate limited (${res.status}) — sleeping ${wait}s (attempts left: ${attemptsLeft})`);
      await sleep(wait * 1000);
      return ghPost(targetUrl, payload, attemptsLeft - 1, Math.min(backoffSec * 2, 300));
    }
    return { ok: false, error: `GitHub API ${res.status}: ${text.slice(0, 300)}` };
  };

  // Post the review with comments[]
  const url = `https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`;
  let posted = false;
  let postError = '';
  try {
    const result = await ghPost(url, { body: reviewBody, event: 'COMMENT', comments: reviewComments });
    if (result.ok) {
      console.log(`✅ Review posted to PR #${PR_NUMBER} with ${reviewComments.length} line comments`);
      posted = true;
    } else {
      postError = result.error;
      console.error(`❌ Failed to post review: ${postError}`);
    }
  } catch (err) {
    postError = err.message;
    console.error('❌ Failed to post review:', err.message);
  }

  // Fallback: post the summary as a regular issue comment if the formal review failed
  if (!posted) {
    try {
      const fallbackUrl = `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`;
      const fallbackResult = await ghPost(fallbackUrl, {
        body: `## 🤖 AI Code Review — ⚠️ Partial Failure\n\n> ${statusLine}\n\nThe line-level review could not be posted.\n**Error:** \`${postError}\`\n\n<details><summary>Summary</summary>\n\n${reviewBody}\n\n</details>`,
      });
      if (fallbackResult.ok) {
        console.log('⚠️  Posted fallback issue comment instead.');
      } else {
        console.error(`❌ Fallback also failed: ${fallbackResult.error}`);
        console.log('\n--- Review Output (fallback stdout) ---\n');
        console.log(reviewBody);
      }
    } catch {
      console.log('\n--- Review Output (fallback stdout) ---\n');
      console.log(reviewBody);
    }
  }

  if (failedPasses.length === PASSES.length) {
    console.error('❌ All review passes failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
