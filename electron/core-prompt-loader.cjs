'use strict';

const path = require('path');
const { readPrompt } = require('./prompts-loader.cjs');

const CORE_FILES = {
  roleMany: 'martin/core/role-many.txt',
  constraintsLanguage: 'martin/core/constraints-language.txt',
  appContext: 'martin/core/app-context.txt',
  toolGuardrails: 'martin/core/tool-guardrails.txt',
  toolSurface: 'martin/core/tool-surface.txt',
  toolFormat: 'martin/core/tool-format.txt',
  toolCatalog: 'martin/core/tool-catalog.txt',
  filesystemRules: 'martin/core/filesystem-rules.txt',
  asyncSubagents: 'martin/core/async-subagents.txt',
  outputFormat: 'martin/core/output-format.txt',
  referenceStub: 'martin/core/reference-stub.txt',
  entityRules: 'martin/core/entity-rules.txt',
  resourceLinks: 'martin/core/resource-links.txt',
};

/** @type {Record<string, string | null> | null} */
let cache = null;

function loadCorePromptSections() {
  if (cache) return cache;
  /** @type {Record<string, string | null>} */
  const sections = {};
  for (const [key, relPath] of Object.entries(CORE_FILES)) {
    sections[key] = readPrompt(relPath);
  }
  cache = sections;
  return sections;
}

function readCoreFile(key) {
  const rel = CORE_FILES[key];
  if (!rel) return null;
  return readPrompt(rel);
}

module.exports = {
  CORE_FILES,
  loadCorePromptSections,
  readCoreFile,
};
