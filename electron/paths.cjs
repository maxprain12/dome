'use strict';

/**
 * Centralized path resolution for the Electron main process.
 *
 * Resolves repo/asar-relative locations independently of the calling module's
 * own `__dirname`, so main-process modules can live in any `electron/<domain>/`
 * subfolder without breaking their resource paths.
 *
 * Resolution strategy (matches the long-standing `prompts-loader.cjs`):
 *   - When Electron's `app` is available, anchor on `app.getAppPath()`
 *     (repo root in dev; `app.asar` root in production).
 *   - Otherwise (plain Node, e.g. scripts/tests), anchor on this file's own
 *     directory. This file always lives at `electron/paths.cjs`, so `..` is the
 *     repo root regardless of where the *caller* lives.
 */

const path = require('path');

let app;
try {
  ({ app } = require('electron'));
} catch {
  // Non-Electron context (scripts, tests): fall back to filesystem layout.
}

/** Repo root in dev; `app.asar` root in production. */
function getAppRoot() {
  if (app && typeof app.getAppPath === 'function') {
    return app.getAppPath();
  }
  return path.join(__dirname, '..');
}

function getElectronRoot() {
  return path.join(getAppRoot(), 'electron');
}

function getDistDir() {
  return path.join(getAppRoot(), 'dist');
}

function getDistIndexHtml() {
  return path.join(getDistDir(), 'index.html');
}

function getPublicDir() {
  return path.join(getAppRoot(), 'public');
}

function getPromptsDir() {
  return path.join(getAppRoot(), 'prompts');
}

/** Core + cross-tool prompt sections (`@dome/prompts/sections`). */
function getPromptsSectionsDir() {
  return path.join(getAppRoot(), 'packages', 'prompts', 'sections');
}

/** Tool-domain operational prompts (`@dome/tools/src/domains`). */
function getToolsDomainsDir() {
  return path.join(getAppRoot(), 'packages', 'tools', 'src', 'domains');
}

/** Surface-specific prompts (`@dome/prompts/surfaces` — subagents, agent-team). */
function getPromptsSurfacesDir() {
  return path.join(getAppRoot(), 'packages', 'prompts', 'surfaces');
}

function getScriptsDir() {
  return path.join(getAppRoot(), 'scripts');
}

function getPreloadPath() {
  return path.join(getElectronRoot(), 'preload.cjs');
}

function getPackageJsonPath() {
  return path.join(getAppRoot(), 'package.json');
}

module.exports = {
  getAppRoot,
  getElectronRoot,
  getDistDir,
  getDistIndexHtml,
  getPublicDir,
  getPromptsDir,
  getPromptsSectionsDir,
  getPromptsSurfacesDir,
  getToolsDomainsDir,
  getScriptsDir,
  getPreloadPath,
  getPackageJsonPath,
};
