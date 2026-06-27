'use strict';

const { readCoreSection, CORE_SECTION_FILES } = require('./tool-prompt-loader.cjs');

/** @type {Record<string, string | null> | null} */
let cache = null;

function loadCorePromptSections() {
  if (cache) return cache;
  /** @type {Record<string, string | null>} */
  const sections = {};
  for (const key of Object.keys(CORE_SECTION_FILES)) {
    sections[key] = readCoreSection(key);
  }
  cache = sections;
  return sections;
}

function readCoreFile(key) {
  return readCoreSection(key);
}

module.exports = {
  CORE_FILES: CORE_SECTION_FILES,
  loadCorePromptSections,
  readCoreFile,
};
