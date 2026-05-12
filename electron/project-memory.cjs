'use strict';

/**
 * Optional project-level "memory" (AGENTS.md at workspace root).
 * Same idea as LangChain Deep Agents / agents.md — keep small; skills carry detail.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_CHARS = 14_000;

/**
 * @param {string | null | undefined} projectRoot - absolute workspace path
 * @param {{ maxChars?: number }} [opts]
 * @returns {string} Markdown block to append to system prompt, or empty string
 */
function loadProjectAgentsMarkdown(projectRoot, opts = {}) {
  const maxChars = typeof opts.maxChars === 'number' && opts.maxChars > 500 ? opts.maxChars : DEFAULT_MAX_CHARS;
  if (!projectRoot || typeof projectRoot !== 'string') return '';
  const trimmed = projectRoot.trim();
  if (!trimmed) return '';
  const absRoot = path.resolve(trimmed);
  const agentsPath = path.join(absRoot, 'AGENTS.md');
  try {
    if (!fs.existsSync(agentsPath) || !fs.statSync(agentsPath).isFile()) return '';
    const raw = fs.readFileSync(agentsPath, 'utf8');
    if (!raw || !String(raw).trim()) return '';
    const text = String(raw).trim();
    const body = text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[AGENTS.md truncated at ${maxChars} chars for context budget]` : text;
    return `## Project memory (AGENTS.md)\n\n${body}\n`;
  } catch (e) {
    console.warn('[ProjectMemory] read AGENTS.md failed:', agentsPath, e?.message || e);
    return '';
  }
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

module.exports = { loadProjectAgentsMarkdown, injectProjectMemoryIntoMessages };
