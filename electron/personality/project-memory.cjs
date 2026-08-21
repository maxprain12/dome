'use strict';

/**
 * Optional project-level "memory" (AGENTS.md at workspace root).
 * Same idea as LangChain Deep Agents / agents.md — keep small; skills carry detail.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_CHARS = 14_000;

/**
 * Read one instruction file into a titled, budget-capped markdown block.
 * @param {string} filePath - absolute path
 * @param {number} maxChars
 * @returns {string} empty string when missing, unreadable or blank
 */
function readInstructionFile(filePath, maxChars) {
  const name = path.basename(filePath);
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return '';
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !String(raw).trim()) return '';
    const text = String(raw).trim();
    const body =
      text.length > maxChars
        ? `${text.slice(0, maxChars)}\n\n[${name} truncated at ${maxChars} chars for context budget]`
        : text;
    return `## Project memory (${name})\n\n${body}\n`;
  } catch (e) {
    console.warn('[ProjectMemory] read failed:', filePath, e?.message || e);
    return '';
  }
}

function resolveMaxChars(opts) {
  return typeof opts.maxChars === 'number' && opts.maxChars > 500 ? opts.maxChars : DEFAULT_MAX_CHARS;
}

/**
 * @param {string | null | undefined} projectRoot - absolute workspace path
 * @param {{ maxChars?: number }} [opts]
 * @returns {string} Markdown block to append to system prompt, or empty string
 */
function loadProjectAgentsMarkdown(projectRoot, opts = {}) {
  if (!projectRoot || typeof projectRoot !== 'string') return '';
  const trimmed = projectRoot.trim();
  if (!trimmed) return '';
  return readInstructionFile(path.join(path.resolve(trimmed), 'AGENTS.md'), resolveMaxChars(opts));
}

/**
 * Load every project instruction file at a coding workspace root (AGENTS.md,
 * CLAUDE.md, …) as one markdown block. Used for coding runs, where the repo —
 * not the Dome vault — carries the rules.
 *
 * @param {Array<{ name: string, path: string }>} files - from workspace-store.listContextFiles
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
function loadWorkspaceContextMarkdown(files, opts = {}) {
  if (!Array.isArray(files) || files.length === 0) return '';
  // Split the budget so one huge CLAUDE.md cannot crowd out AGENTS.md.
  const perFile = Math.max(1000, Math.floor(resolveMaxChars(opts) / files.length));
  return files
    .map((file) => readInstructionFile(file.path, perFile))
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {Array<{ role: string; content?: string }>} messages - Dome chat shape
 * @param {string} block - markdown from loadProjectAgentsMarkdown
 * @returns {Array<{ role: string; content: string }>}
 */
function injectProjectMemoryIntoMessages(messages, block) {
  if (!block || !Array.isArray(messages) || messages.length === 0) return messages;
  const first = messages[0];
  if (first && first.role === 'system' && typeof first.content === 'string') {
    const next = [...messages];
    next[0] = { ...first, content: `${first.content.trimEnd()}\n\n${block}` };
    return next;
  }
  return [{ role: 'system', content: block }, ...messages];
}

module.exports = {
  loadProjectAgentsMarkdown,
  loadWorkspaceContextMarkdown,
  injectProjectMemoryIntoMessages,
};
