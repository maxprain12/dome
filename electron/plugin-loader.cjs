/* eslint-disable no-console */
/**
 * Plugin Loader - Validates and lists installed plugins
 * Phase 1: Manifest validation, no runtime execution yet
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const PLUGINS_DIR = 'plugins';

function getPluginsDir() {
  return path.join(app.getPath('userData'), PLUGINS_DIR);
}

function ensurePluginsDir() {
  const dir = getPluginsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validate plugin manifest
 * @param {object} manifest - Parsed manifest.json
 * @returns {{ valid: boolean, error?: string }}
 */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Invalid manifest' };
  }
  const required = ['id', 'name', 'author', 'description', 'version'];
  for (const key of required) {
    if (!manifest[key] || typeof manifest[key] !== 'string') {
      return { valid: false, error: `Missing or invalid: ${key}` };
    }
  }
  if (!/^[a-z0-9-]+$/i.test(manifest.id)) {
    return { valid: false, error: 'Plugin id must be alphanumeric with hyphens' };
  }
  return { valid: true };
}

/**
 * List all installed plugins
 * @returns {Array<{ manifest: object, dir: string, enabled: boolean }>}
 */
function listPlugins() {
  ensurePluginsDir();
  const pluginsDir = getPluginsDir();
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      const { valid, error } = validateManifest(manifest);
      if (!valid) {
        console.warn(`[Plugins] Invalid manifest for ${entry.name}:`, error);
        continue;
      }

      const enabledPath = path.join(pluginDir, '.enabled');
      const enabled = fs.existsSync(enabledPath);

      plugins.push({
        ...manifest,
        dir: pluginDir,
        enabled,
      });
    } catch (err) {
      console.warn(`[Plugins] Error reading ${entry.name}:`, err.message);
    }
  }

  return plugins;
}

/**
 * Install plugin from a directory (copy to plugins folder)
 * @param {string} sourceDir - Path to plugin folder (contains manifest.json, main.js)
 * @returns {{ success: boolean, plugin?: object, error?: string }}
 */
function installFromDir(sourceDir) {
  ensurePluginsDir();
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { success: false, error: 'manifest.json not found' };
  }

  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: 'Invalid manifest.json' };
  }

  const { valid, error } = validateManifest(manifest);
  if (!valid) {
    return { success: false, error };
  }

  const mainPath = path.join(sourceDir, 'main.js');
  if (!fs.existsSync(mainPath)) {
    return { success: false, error: 'main.js not found' };
  }

  const destDir = path.join(getPluginsDir(), manifest.id);
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const copyRecursive = (src, dest) => {
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        copyRecursive(path.join(src, name), path.join(dest, name));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  for (const name of fs.readdirSync(sourceDir)) {
    if (name === 'node_modules') continue;
    const src = path.join(sourceDir, name);
    const dest = path.join(destDir, name);
    copyRecursive(src, dest);
  }

  fs.writeFileSync(path.join(destDir, '.enabled'), '1');

  return { success: true, plugin: { ...manifest, dir: destDir, enabled: true } };
}

/**
 * Uninstall a plugin
 * @param {string} pluginId - Plugin id
 * @returns {{ success: boolean, error?: string }}
 */
function uninstall(pluginId) {
  if (!pluginId || typeof pluginId !== 'string') {
    return { success: false, error: 'Invalid plugin id' };
  }
  if (!/^[a-z0-9-]+$/i.test(pluginId)) {
    return { success: false, error: 'Invalid plugin id format' };
  }

  const pluginDir = path.join(getPluginsDir(), pluginId);
  if (!fs.existsSync(pluginDir)) {
    return { success: false, error: 'Plugin not installed' };
  }

  try {
    fs.rmSync(pluginDir, { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Toggle plugin enabled state
 */
function setEnabled(pluginId, enabled) {
  const pluginDir = path.join(getPluginsDir(), pluginId);
  const enabledPath = path.join(pluginDir, '.enabled');
  if (!fs.existsSync(pluginDir)) {
    return { success: false, error: 'Plugin not installed' };
  }
  if (enabled) {
    fs.writeFileSync(enabledPath, '1');
  } else if (fs.existsSync(enabledPath)) {
    fs.unlinkSync(enabledPath);
  }
  return { success: true };
}

module.exports = {
  getPluginsDir,
  ensurePluginsDir,
  validateManifest,
  listPlugins,
  installFromDir,
  uninstall,
  setEnabled,
};
