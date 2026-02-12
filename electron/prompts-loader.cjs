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
 * Build WhatsApp system prompt with dynamic context.
 * @param {Object} options
 * @param {string} options.contextSection - Built context (project, resources, date, time)
 */
function buildWhatsAppPrompt(contextSection) {
  const template = readPrompt('whatsapp/base.txt');
  if (!template) {
    return `You are Many, Dome's AI assistant.\n\n${contextSection}`;
  }
  return template.replace(/\{\{contextSection\}\}/g, contextSection);
}

/**
 * Build the context section for WhatsApp (project, recent resources, date, time).
 * Called by message-handler with actual data.
 */
function buildWhatsAppContextSection(lines) {
  return lines.filter(Boolean).join('\n');
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
  buildWhatsAppPrompt,
  buildWhatsAppContextSection,
  getMartinCapabilities,
};
