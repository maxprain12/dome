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
const MAX_DIFF_CHARS = 40000;
const truncated = diff.length > MAX_DIFF_CHARS;
const diffContent = truncated
  ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[... diff truncated for length ...]'
  : diff;

/**
 * Call the AI API (OpenAI-compatible format)
 */
async function callAI(systemPrompt, userContent) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
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
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Review Pass Prompts ──────────────────────────────────────────────────────

const ARCH_PROMPT = `You are a code reviewer for Dome, an Electron + React desktop app.

CRITICAL RULES to enforce:
1. Code in app/ (renderer process) must NEVER import Node.js modules: fs, better-sqlite3, bun:sqlite, electron, etc.
2. New IPC channels must be whitelisted in electron/preload.cjs ALLOWED_CHANNELS.
3. IPC handlers in electron/ipc/*.cjs must validate sender and sanitize inputs.
4. Use import type { } for type-only imports (verbatimModuleSyntax is on).
5. File system access must go through IPC, never directly from renderer.

Review the diff for architecture violations. Be concise.
Format: bullet points starting with ✅ (ok) or ❌ (violation) or ⚠️ (warning).
If no issues found, say "✅ No architecture violations found."`;

const LOGIC_PROMPT = `You are a code reviewer for Dome, an Electron + React desktop app.

Review the diff for logic bugs, runtime errors, and security issues:
- Unhandled promise rejections or missing error handling in IPC handlers
- Race conditions in async React hooks or Electron operations
- SQL injection risks in database queries
- Missing null/undefined checks that could cause crashes
- Incorrect use of Zustand store mutations

Be concise. Format: bullet points starting with ❌ (bug) or ⚠️ (risk) or ✅ (ok).
If no issues found, say "✅ No logic issues found."`;

const STYLE_PROMPT = `You are a code reviewer for Dome, an Electron + React desktop app.

Review the diff for style and convention issues:
- Hardcoded colors (should use CSS variables like var(--primary-text), var(--accent))
- User-visible strings not wrapped in t() for i18n translation
- Missing i18n keys in all 4 languages (en, es, fr, pt) in app/lib/i18n.ts
- TypeScript: any types, non-obvious code without comments
- React anti-patterns: useEffect with missing deps, inline object/array literals in JSX props

Be concise. Format: bullet points starting with ❌ (must fix) or ⚠️ (suggestion) or ✅ (ok).
If no issues found, say "✅ No style issues found."`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🤖 Running AI code review using ${MODEL} at ${BASE_URL}`);

  const userContent = `Here is the PR diff to review:\n\n\`\`\`diff\n${diffContent}\n\`\`\``;

  let archResult, logicResult, styleResult;

  try {
    console.log('  Pass 1/3: Architecture check...');
    archResult = await callAI(ARCH_PROMPT, userContent);
  } catch (err) {
    archResult = `⚠️ Review failed: ${err.message}`;
  }

  try {
    console.log('  Pass 2/3: Logic & bugs...');
    logicResult = await callAI(LOGIC_PROMPT, userContent);
  } catch (err) {
    logicResult = `⚠️ Review failed: ${err.message}`;
  }

  try {
    console.log('  Pass 3/3: Style & conventions...');
    styleResult = await callAI(STYLE_PROMPT, userContent);
  } catch (err) {
    styleResult = `⚠️ Review failed: ${err.message}`;
  }

  const reviewBody = `## 🤖 AI Code Review

> Model: \`${MODEL}\` | ${truncated ? '⚠️ Diff was truncated' : 'Full diff reviewed'}

---

### Pass 1 — Architecture & Process Separation

${archResult}

---

### Pass 2 — Logic & Security

${logicResult}

---

### Pass 3 — Style & Conventions

${styleResult}

---
<sub>This review is automated. Treat it as a helpful sanity check, not a final verdict.</sub>`;

  console.log('\n📋 Review complete.');

  // Post to GitHub PR if we have the required env vars
  if (GITHUB_TOKEN && PR_NUMBER && REPO) {
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
        body: JSON.stringify({
          body: reviewBody,
          event: 'COMMENT',
        }),
      });

      if (res.ok) {
        console.log(`✅ Review posted to PR #${PR_NUMBER}`);
      } else {
        const text = await res.text();
        console.error(`❌ Failed to post review: ${res.status} ${text}`);
      }
    } catch (err) {
      console.error('❌ Failed to post review to GitHub:', err.message);
    }
  } else {
    // Dry run: just print to stdout
    console.log('\n--- Review Output (dry run) ---\n');
    console.log(reviewBody);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
