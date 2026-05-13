/**
 * Prompt loader for Electron main process.
 * Reads prompt templates from prompts/ folder (sync fs access).
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getPromptsDir() {
  // In dev: project root. In prod: same level as app.asar
  const appPath = app?.getAppPath ? app.getAppPath() : process.cwd();
  return path.join(appPath, 'prompts');
}

function readPrompt(relativePath) {
  try {
    const fullPath = path.join(getPromptsDir(), relativePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch (err) {
    console.error('[Prompts] Error reading', relativePath, err.message);
  }
  return null;
}

/**
 * Read Martin capabilities section (used by personality-loader).
 */
function getMartinCapabilities() {
  return readPrompt('martin/capabilities.txt');
}

module.exports = {
  getPromptsDir,
  readPrompt,
  getMartinCapabilities,
};
