#!/usr/bin/env node
/**
 * AI Code Review Script for Dome
 *
 * Reads a git diff from stdin, runs 3 review passes via AI, and posts
 * a review comment on the PR via GitHub API.
 *
 * Multi-provider: works with MiniMax, DeepSeek, OpenAI, Anthropic-compatible,
 * or any OpenAI-compatible endpoint.
 *
 * Config via env vars:
 *   AI_REVIEW_API_KEY    - API key (required)
 *   AI_REVIEW_BASE_URL   - Base URL (default: https://api.openai.com/v1)
 *   AI_REVIEW_MODEL      - Model name (default: gpt-4o)
 *   GITHUB_TOKEN         - GitHub token for posting review (required in CI)
 *   PR_NUMBER            - PR number (set by GitHub Actions)
 *   REPO                 - owner/repo (set by GitHub Actions)
 */

import { readFileSync } from 'fs';

const API_KEY = process.env.AI_REVIEW_API_KEY;
const BASE_URL = (process.env.AI_REVIEW_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_REVIEW_MODEL || 'gpt-4o';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;

// Timeout per AI call (ms) — 50s is generous, avoids hanging forever
const CALL_TIMEOUT_MS = 50_000;
// Retries per pass before giving up
const MAX_RETRIES = 2;
// Delay between retries (ms) — doubles each attempt
const RETRY_BASE_DELAY_MS = 6_000;

if (!API_KEY) {
  console.error('❌ AI_REVIEW_API_KEY is required');
  process.exit(1);
}

// Read diff from stdin
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

// Truncate diff if too large (context window limit)
const MAX_DIFF_CHARS = 40_000;
const truncated = diff.length > MAX_DIFF_CHARS;
const diffContent = truncated
  ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[... diff truncated for length ...]'
  : diff;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip <think>…</think> blocks emitted by reasoning models (e.g. MiniMax-M2.7). */
function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^(\s*\n)+/, '')
    .trim();
}

/** Sleep for ms milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the AI API (OpenAI-compatible format) with timeout and retries.
 * Returns the model's text content, with <think> blocks stripped.
 * Throws only if all retries are exhausted.
 */
async function callAI(systemPrompt, userContent) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.log(`    ↻ Retry ${attempt}/${MAX_RETRIES} after ${delay / 1000}s…`);
      await sleep(delay);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('AI call timed out')), CALL_TIMEOUT_MS);

      let response;
      try {
        response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            temperature: 0.2,
            max_tokens: 1200,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      if (!raw) throw new Error('Empty response from model');
      return stripThinking(raw);
    } catch (err) {
      lastError = err;
      console.log(`    ✗ Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  throw lastError;
}

// ─── Review Pass Prompts ──────────────────────────────────────────────────────

// Shared CSS variable context injected into relevant passes to prevent false positives.
const CSS_VAR_CONTEXT = `
## Known valid CSS variables (defined in app/globals.css)
These are ALL valid — never flag them as "undocumented" or "undefined":

Text colors:
  --primary-text, --secondary-text, --tertiary-text
  --dome-text (alias → --primary-text)
  --dome-text-secondary (alias → --secondary-text)
  --dome-text-muted (alias → --tertiary-text)
  --base-text (#FFFFFF in light, #121212 in dark — for text ON colored backgrounds like buttons)

Backgrounds:
  --bg, --bg-secondary, --bg-tertiary, --bg-hover
  --dome-bg (alias → --bg)
  --dome-bg-hover (alias → --bg-hover)
  --dome-accent-bg (translucent accent for highlights)

Interactive / accent:
  --accent, --accent-hover
  --dome-accent (alias → --accent)
  --dome-accent-hover (alias → --accent-hover)

Semantic:
  --dome-error (alias → --error, maps to #ef4444-equivalent)
  --error, --warning, --success

Borders:
  --border, --border-hover
  --dome-border (alias → --border)

Only flag LITERAL hex values (#rrggbb / #rgb / rgb()) that appear OUTSIDE of a CSS var() wrapper.
Do NOT flag fallback values inside var(--x, fallback) as errors — fallbacks are acceptable.
`.trim();

const ARCH_PROMPT = `You are a senior code reviewer for Dome, an Electron + React desktop app.

## Your job
Review the diff ONLY for architecture violations. Be direct — no preamble, no summaries.

## Critical rules to enforce
1. Code in app/ (renderer) must NEVER import Node.js modules: fs, path, better-sqlite3, bun:sqlite, electron, child_process, etc.
2. New IPC channels must be whitelisted in electron/preload.cjs ALLOWED_CHANNELS.
3. IPC handlers in electron/ipc/*.cjs must validate the sender (event.sender) and sanitize inputs.
4. ALL type-only imports must use \`import type { }\` (verbatimModuleSyntax is ON).
5. File system and database access must go through IPC from the renderer — never directly.

## Format
- One bullet per finding: ✅ (ok) | ❌ (violation) | ⚠️ (warning)
- If nothing wrong: a single line "✅ No architecture violations found."
- Maximum 10 bullets. Be precise.`;

const LOGIC_PROMPT = `You are a senior code reviewer for Dome, an Electron + React desktop app.

## Your job
Review the diff for logic bugs, runtime errors, and security issues. Be direct — no preamble, no summaries.

## Focus on
- Unhandled promise rejections or async operations without try/catch where a crash would occur
- Race conditions in React hooks (stale closures, missing cleanup in useEffect)
- SQL injection risks (string concatenation in queries instead of parameterized statements)
- Null/undefined dereferences that would throw at runtime
- Incorrect Zustand store mutations (direct array/object mutation instead of returning new state)
- IPC handlers that throw errors to the renderer instead of returning \`{ success: false, error }\`

## Format
- One bullet per finding: ❌ (bug/crash risk) | ⚠️ (risk/warning) | ✅ (ok)
- If nothing wrong: a single line "✅ No logic issues found."
- Maximum 10 bullets. Be precise. Skip minor style opinions.`;

const STYLE_PROMPT = `You are a senior code reviewer for Dome, an Electron + React desktop app.

## Your job
Review the diff for style and convention issues. Be direct — no preamble, no summaries.

${CSS_VAR_CONTEXT}

## Check for
1. Literal hex color values hardcoded in style= or className= attributes OUTSIDE of a var() wrapper (e.g. style={{ color: '#ff0000' }})
2. User-visible strings in JSX that are NOT wrapped in t() from react-i18next
3. Translation keys added to one language but missing from others (en/es/fr/pt) in app/lib/i18n.ts
4. TypeScript \`any\` types where a proper type is clearly derivable
5. React anti-patterns: useEffect missing dependencies, inline object/array literals as props that cause re-renders

## Format
- One bullet per finding: ❌ (must fix) | ⚠️ (suggestion) | ✅ (ok)
- If nothing wrong: a single line "✅ No style issues found."
- Maximum 10 bullets. Be precise.`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🤖 Running AI code review`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Endpoint: ${BASE_URL}`);
  console.log(`   Diff: ${diffContent.length} chars${truncated ? ' (truncated)' : ''}`);

  const userContent = `Here is the PR diff to review:\n\n\`\`\`diff\n${diffContent}\n\`\`\``;

  const passes = [
    { name: 'Architecture & Process Separation', prompt: ARCH_PROMPT },
    { name: 'Logic & Security',                  prompt: LOGIC_PROMPT },
    { name: 'Style & Conventions',               prompt: STYLE_PROMPT },
  ];

  const results = [];

  for (let i = 0; i < passes.length; i++) {
    const { name, prompt } = passes[i];
    console.log(`\n  Pass ${i + 1}/${passes.length}: ${name}…`);
    try {
      const text = await callAI(prompt, userContent);
      results.push({ name, text, ok: true });
      console.log(`  ✓ Done (${text.length} chars)`);
    } catch (err) {
      const errorMsg = `⚠️ Review pass failed after ${MAX_RETRIES + 1} attempts.\n**Error:** \`${err.message}\`\n\nThis pass will need to be re-run manually.`;
      results.push({ name, text: errorMsg, ok: false });
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  // Compute status line
  const failedCount = results.filter((r) => !r.ok).length;
  const statusLine = failedCount === 0
    ? `✅ All 3 passes completed`
    : `⚠️ ${failedCount}/3 pass${failedCount > 1 ? 'es' : ''} failed — API errors, see below`;

  const reviewBody = [
    `## 🤖 AI Code Review`,
    ``,
    `> Model: \`${MODEL}\` | ${truncated ? '⚠️ Diff was truncated' : 'Full diff reviewed'} | ${statusLine}`,
    ``,
    ...results.flatMap(({ name }, idx) => [
      `---`,
      ``,
      `### Pass ${idx + 1} — ${name}`,
      ``,
      results[idx].text,
      ``,
    ]),
    `---`,
    `<sub>This review is automated. Treat it as a helpful sanity check, not a final verdict.</sub>`,
  ].join('\n');

  console.log('\n📋 Review assembled.');

  // Post to GitHub PR
  if (GITHUB_TOKEN && PR_NUMBER && REPO) {
    let posted = false;
    let postError = '';
    try {
      const url = `https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ body: reviewBody, event: 'COMMENT' }),
      });

      if (res.ok) {
        console.log(`✅ Review posted to PR #${PR_NUMBER}`);
        posted = true;
      } else {
        const text = await res.text().catch(() => '');
        postError = `GitHub API ${res.status}: ${text.slice(0, 200)}`;
        console.error(`❌ Failed to post review: ${postError}`);
      }
    } catch (err) {
      postError = err.message;
      console.error('❌ Failed to post review to GitHub:', err.message);
    }

    // If posting failed, post a minimal error comment so there's a visible signal in the PR
    if (!posted && GITHUB_TOKEN) {
      try {
        const url = `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`;
        await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            body: `## 🤖 AI Code Review — ⚠️ Partial Failure\n\n> Model: \`${MODEL}\` | ${statusLine}\n\nThe review was generated but could not be posted as a formal PR review.\n**Error:** \`${postError}\`\n\n<details><summary>Review content</summary>\n\n${reviewBody}\n\n</details>`,
          }),
        });
        console.log('⚠️  Posted fallback issue comment instead.');
      } catch {
        // Last resort: print to stdout so it appears in the CI logs
        console.log('\n--- Review Output (fallback stdout) ---\n');
        console.log(reviewBody);
      }
    }
  } else {
    // Dry run: print to stdout
    console.log('\n--- Review Output (dry run) ---\n');
    console.log(reviewBody);
  }

  // Exit non-zero if all passes failed so CI can surface the problem
  if (failedCount === passes.length) {
    console.error('❌ All review passes failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
