'use strict';

/**
 * Unified prompt loader: `@dome/prompts/sections` + `@dome/tools/.../domains`.
 * Keep DOC_MANIFEST in sync with `packages/tools/src/domains/manifest.ts`.
 */

const fs = require('fs');
const path = require('path');
const { getPromptsSectionsDir, getToolsDomainsDir } = require('../paths.cjs');

/** @type {Record<string, string | null>} */
const cache = {};

/** @type {Record<string, { kind: 'section' | 'domain', file: string }>} */
const DOC_MANIFEST = {
  entity_rules: { kind: 'section', file: 'entity-rules.txt' },
  resource_links: { kind: 'section', file: 'resource-links.txt' },
  artifacts: { kind: 'domain', file: 'artifacts/prompt.txt' },
  artifact_persisted: { kind: 'domain', file: 'artifacts/prompt-persisted.txt' },
  artifact_design: { kind: 'domain', file: 'artifacts/prompt-design.txt' },
  feeders: { kind: 'domain', file: 'feeders/prompt.txt' },
  ppt_tool: { kind: 'domain', file: 'office/prompt-ppt.txt' },
  docx_tool: { kind: 'domain', file: 'office/prompt-docx.txt' },
  calendar_tool: { kind: 'domain', file: 'calendar/prompt.txt' },
  flashcard_tool: { kind: 'domain', file: 'flashcards/prompt.txt' },
  excel_notebook_tool: { kind: 'domain', file: 'office/prompt-excel-notebook.txt' },
  excel_artifact_tool: { kind: 'domain', file: 'office/prompt-excel-artifact.txt' },
  email_tool: { kind: 'domain', file: 'email/prompt.txt' },
  github_tool: { kind: 'domain', file: 'github/prompt.txt' },
  social_tool: { kind: 'domain', file: 'social/prompt.txt' },
};

const CORE_SECTION_FILES = {
  roleMany: 'role-many.txt',
  constraintsLanguage: 'constraints-language.txt',
  appContext: 'app-context.txt',
  toolGuardrails: 'tool-guardrails.txt',
  toolSurface: 'tool-surface.txt',
  toolFormat: 'tool-format.txt',
  toolCatalog: 'tool-catalog.txt',
  filesystemRules: 'filesystem-rules.txt',
  outputFormat: 'output-format.txt',
  referenceStub: 'reference-stub.txt',
  entityRules: 'entity-rules.txt',
  resourceLinks: 'resource-links.txt',
};

function readFileOrNull(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  } catch {
    /* ignore */
  }
  return null;
}

function readSectionFile(filename) {
  return readFileOrNull(path.join(getPromptsSectionsDir(), filename));
}

function readDomainPrompt(relPath) {
  return readFileOrNull(path.join(getToolsDomainsDir(), relPath));
}

/**
 * Read a core system section by logical key (assembler / core-prompt-loader).
 * @param {string} key
 */
function readCoreSection(key) {
  if (cache[`core:${key}`] !== undefined) return cache[`core:${key}`];
  const filename = CORE_SECTION_FILES[key];
  if (!filename) {
    cache[`core:${key}`] = null;
    return null;
  }
  const body = readSectionFile(filename);
  cache[`core:${key}`] = body?.trim() ? body : null;
  return cache[`core:${key}`];
}

/**
 * On-demand bodies for dome_load_doc.
 * @param {string} docId
 */
function getSectionBody(docId) {
  if (cache[docId] !== undefined) return cache[docId];

  const entry = DOC_MANIFEST[docId];
  if (!entry) {
    cache[docId] = null;
    return null;
  }

  const body = entry.kind === 'section' ? readSectionFile(entry.file) : readDomainPrompt(entry.file);

  if (typeof body === 'string' && body.trim().length > 0) {
    cache[docId] = body;
    return body;
  }

  cache[docId] = null;
  return null;
}

module.exports = {
  DOC_MANIFEST,
  CORE_SECTION_FILES,
  readCoreSection,
  readSectionFile,
  readDomainPrompt,
  getSectionBody,
};
