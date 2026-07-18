'use strict';

/**
 * File-based agent context (Hermes-style soul / user / memory).
 * Thin wrapper over personality-loader for harness integration.
 *
 * Memory boundary (do not mix):
 * - agent-sessions/*.jsonl  → run history + compaction (ephemeral)
 * - martin/SOUL|USER|MEMORY → LTM of the user
 * - ~/.dome/skills          → procedural SKILL.md
 * - AGENTS.md (vault root)  → project memory
 */

const personalityLoader = require('./personality-loader.cjs');
const projectMemory = require('./project-memory.cjs');

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

function resolveProjectVaultRoot(projectId) {
  if (!projectId || typeof projectId !== 'string') return null;
  try {
    const database = require('../core/database.cjs');
    const fileStorage = require('../storage/file-storage.cjs');
    const vaultStore = require('../storage/vault-store.cjs');
    const queries = database.getQueries();
    const roots = vaultStore.getProjectRoots(queries, fileStorage);
    const match = roots.find((r) => r.projectId === projectId);
    return match?.root || null;
  } catch (err) {
    console.warn('[ContextFiles] resolveProjectVaultRoot failed:', err?.message || err);
    return null;
  }
}

/**
 * Single entry for agent LTM (+ optional project AGENTS.md + domain packs).
 * When memoryEnabled is false, soul is still returned for persona but volatile LTM is empty.
 *
 * @param {{
 *   memoryEnabled?: boolean;
 *   projectId?: string | null;
 *   projectPath?: string | null;
 *   includeProject?: boolean;
 *   includeDomains?: Array<'social'|'email'|string>;
 * }} [opts]
 */
function loadAgentMemoryContext(opts = {}) {
  const memoryEnabled = opts.memoryEnabled !== false;
  const includeProject = opts.includeProject !== false;
  const files = loadContextFiles();

  if (!memoryEnabled) {
    return {
      soul: files.soul,
      user: '',
      memory: '',
      recentMemory: '',
      memoryBlock: '',
      projectMemory: '',
      domainMemory: '',
      volatileMemory: '',
    };
  }

  const memoryBlock = formatMemoryContextBlock(files);
  let projectBlock = '';
  if (includeProject) {
    const root =
      (typeof opts.projectPath === 'string' && opts.projectPath.trim()) ||
      resolveProjectVaultRoot(opts.projectId);
    if (root) {
      projectBlock = projectMemory.loadProjectAgentsMarkdown(root);
    }
  }

  const domainMemory =
    typeof personalityLoader.formatDomainMemoryBlock === 'function'
      ? personalityLoader.formatDomainMemoryBlock(opts.includeDomains || [])
      : '';
  const volatileMemory = [memoryBlock, projectBlock, domainMemory].filter(Boolean).join('\n\n');
  return {
    soul: files.soul,
    user: files.user,
    memory: files.memory,
    recentMemory: files.recentMemory,
    memoryBlock,
    projectMemory: projectBlock,
    domainMemory,
    volatileMemory,
  };
}

module.exports = {
  loadContextFiles,
  formatMemoryContextBlock,
  loadAgentMemoryContext,
  resolveProjectVaultRoot,
};
