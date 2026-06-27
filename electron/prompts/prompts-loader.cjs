/**
 * Prompt loader for Electron main process.
 * Reads prompt templates from prompts/ (surfaces) and packages/prompts (sections/surfaces).
 */

const path = require('path');
const fs = require('fs');
const { getPromptsDir, getPromptsSectionsDir, getPromptsSurfacesDir } = require('../paths.cjs');

function readFileOrNull(fullPath) {
  try {
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch (err) {
    console.error('[Prompts] Error reading', fullPath, err.message);
  }
  return null;
}

/** Legacy relative path under `prompts/` (editor, studio, review, audits). */
function readPrompt(relativePath) {
  return readFileOrNull(path.join(getPromptsDir(), relativePath));
}

/** Core or cross-tool section under `packages/prompts/sections/`. */
function readSectionPrompt(filename) {
  return readFileOrNull(path.join(getPromptsSectionsDir(), filename));
}

/** Surface-specific prompt under `packages/prompts/surfaces/` (subagents, agent-team). */
function readSurfacePrompt(relativePath) {
  return readFileOrNull(path.join(getPromptsSurfacesDir(), relativePath));
}

function readSubagentPrompt(name) {
  return readSurfacePrompt(path.join('subagents', `${name}.txt`));
}

function getCapabilitiesPrompt() {
  return readSectionPrompt('capabilities.txt');
}

/** @deprecated Use getCapabilitiesPrompt */
function getMartinCapabilities() {
  return getCapabilitiesPrompt();
}

module.exports = {
  getPromptsDir,
  readPrompt,
  readSectionPrompt,
  readSurfacePrompt,
  readSubagentPrompt,
  getCapabilitiesPrompt,
  getMartinCapabilities,
};
