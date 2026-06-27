'use strict';

/**
 * File-based agent context (Hermes-style soul / user / memory).
 * Thin wrapper over personality-loader for harness integration.
 */

const personalityLoader = require('./personality-loader.cjs');

const MAX_SOUL_CHARS = 24_000;
const MAX_USER_CHARS = 12_000;
const MAX_MEMORY_CHARS = 16_000;

function trimBlock(text, maxChars, label) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[${label} truncated at ${maxChars} chars]`;
}

/**
 * @returns {{ soul: string; user: string; memory: string; recentMemory: string }}
 */
function loadContextFiles() {
  personalityLoader.ensureDefaultFiles();
  const soul = trimBlock(personalityLoader.readContextFile('SOUL.md'), MAX_SOUL_CHARS, 'SOUL.md');
  const user = trimBlock(personalityLoader.readContextFile('USER.md'), MAX_USER_CHARS, 'USER.md');
  const memory = trimBlock(personalityLoader.readContextFile('MEMORY.md'), MAX_MEMORY_CHARS, 'MEMORY.md');

  const recent = personalityLoader.getRecentMemory(3);
  let recentMemory = '';
  if (recent.length > 0) {
    const parts = recent.map((mem) => `### ${mem.date}\n${mem.content.slice(0, 800)}`);
    recentMemory = trimBlock(parts.join('\n\n'), 4000, 'Recent memory');
  }

  return { soul, user, memory, recentMemory };
}

/**
 * @returns {string} Markdown block for volatile context (user + memory + recent).
 */
function formatMemoryContextBlock(files) {
  const f = files || loadContextFiles();
  const sections = [];
  if (f.user) sections.push(`## User Information\n${f.user}`);
  if (f.memory) sections.push(`## Long-Term Memory\n${f.memory}`);
  if (f.recentMemory) sections.push(`## Recent Memory\n${f.recentMemory}`);
  return sections.join('\n\n');
}

module.exports = {
  loadContextFiles,
  formatMemoryContextBlock,
};
