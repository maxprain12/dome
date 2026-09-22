'use strict';

/* eslint-disable no-console */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { digestManifest, validateManifest } = require('../plugins/manifest.cjs');

const PLUGINS_DIR = 'plugins';
const MAX_FILE_COUNT = 2_000;
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

function getPluginsDir() {
  return path.join(app.getPath('userData'), PLUGINS_DIR);
}

function ensurePluginsDir() {
  const dir = getPluginsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolvePluginPath(pluginDir, relativePath) {
  const candidate = String(relativePath || '');
  if (!candidate || candidate.includes('\0') || path.isAbsolute(candidate)) {
    throw new Error('Invalid plugin path');
  }
  const root = fs.realpathSync(pluginDir);
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path outside plugin directory');
  }
  return resolved;
}

function readAndValidateManifest(sourceDir) {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json not found');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) throw new Error('manifest.json is too large');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error('Invalid manifest.json');
  }
  const result = validateManifest(input, app.getVersion());
  if (!result.valid) throw new Error(result.error);
  const manifest = result.manifest;
  if (manifest.type === 'view') {
    const entryPath = resolvePluginPath(sourceDir, manifest.entry);
    if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
      throw new Error(`Plugin entry not found: ${manifest.entry}`);
    }
  }
  return manifest;
}

function validateSourceTree(sourceDir) {
  let count = 0;
  let bytes = 0;
  const visit = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Plugin packages cannot contain symbolic links');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        if (name === 'node_modules' || name === '.git') continue;
        visit(path.join(current, name));
      }
      return;
    }
    if (!stat.isFile()) throw new Error('Plugin packages may only contain files and folders');
    count += 1;
    bytes += stat.size;
    if (count > MAX_FILE_COUNT) throw new Error(`Plugin exceeds ${MAX_FILE_COUNT} files`);
    if (bytes > MAX_UNPACKED_BYTES) throw new Error('Plugin exceeds 100 MiB unpacked');
  };
  visit(sourceDir);
}

function copySourceTree(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of fs.readdirSync(sourceDir)) {
    if (name === 'node_modules' || name === '.git' || name === '.enabled') continue;
    const source = path.join(sourceDir, name);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error('Plugin packages cannot contain symbolic links');
    const target = path.join(targetDir, name);
    if (stat.isDirectory()) copySourceTree(source, target);
    else fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
}

function activateStagedPlugin(stagingDir, manifest) {
  const pluginRoot = ensurePluginsDir();
  const destination = path.join(pluginRoot, manifest.id);
  const backup = path.join(pluginRoot, `.${manifest.id}.previous`);
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(destination)) fs.renameSync(destination, backup);
  try {
    fs.renameSync(stagingDir, destination);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    if (fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  }
  return { ...manifest, dir: destination, enabled: false, manifestDigest: digestManifest(manifest) };
}

function installFromDir(sourceDir) {
  ensurePluginsDir();
  const resolvedSource = fs.realpathSync(sourceDir);
  validateSourceTree(resolvedSource);
  const manifest = readAndValidateManifest(resolvedSource);
  const stagingDir = path.join(getPluginsDir(), `.staging-${manifest.id}-${crypto.randomUUID()}`);
  try {
    copySourceTree(resolvedSource, stagingDir);
    const stagedManifest = readAndValidateManifest(stagingDir);
    const plugin = activateStagedPlugin(stagingDir, stagedManifest);
    return { success: true, plugin };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return { success: false, error: error.message };
  }
}

function listPlugins() {
  const pluginsDir = ensurePluginsDir();
  const plugins = [];
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    try {
      const manifest = readAndValidateManifest(pluginDir);
      if (manifest.id !== entry.name) {
        console.warn(`[Plugins] Ignoring ${entry.name}: manifest id does not match directory`);
        continue;
      }
      plugins.push({
        ...manifest,
        dir: pluginDir,
        enabled: fs.existsSync(path.join(pluginDir, '.enabled')),
        manifestDigest: digestManifest(manifest),
      });
    } catch (error) {
      console.warn(`[Plugins] Ignoring ${entry.name}:`, error.message);
    }
  }
  return plugins;
}

function uninstall(pluginId) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(String(pluginId || ''))) {
    return { success: false, error: 'Invalid plugin id' };
  }
  const pluginDir = path.join(getPluginsDir(), pluginId);
  if (!fs.existsSync(pluginDir)) return { success: false, error: 'Plugin not installed' };
  fs.rmSync(pluginDir, { recursive: true });
  return { success: true };
}

function setEnabled(pluginId, enabled) {
  const plugin = listPlugins().find((item) => item.id === pluginId);
  if (!plugin) return { success: false, error: 'Plugin not installed' };
  const marker = path.join(plugin.dir, '.enabled');
  if (enabled) fs.writeFileSync(marker, '1', 'utf8');
  else fs.rmSync(marker, { force: true });
  return { success: true };
}

function getBundledPluginDir(pluginId) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'plugins')
    : path.join(app.getAppPath(), 'assets', 'plugins');
  return resolvePluginPath(base, pluginId);
}

function installBundled(pluginId) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(String(pluginId || ''))) {
    return { success: false, error: 'Invalid bundled plugin id' };
  }
  const sourceDir = getBundledPluginDir(pluginId);
  if (!fs.existsSync(sourceDir)) return { success: false, error: 'Bundled plugin not found' };
  return installFromDir(sourceDir);
}

async function downloadBuffer(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Dome-Plugin/1.0' } });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_DOWNLOAD_BYTES) throw new Error('Plugin download exceeds 20 MiB');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('Plugin download exceeds 20 MiB');
  return buffer;
}

async function extractZipBuffer(buffer, targetDir) {
  const yauzl = require('yauzl');
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) return reject(openError);
      let count = 0;
      let bytes = 0;
      const fail = (error) => {
        zipFile.close();
        reject(error);
      };
      zipFile.on('entry', (entry) => {
        count += 1;
        bytes += entry.uncompressedSize;
        if (count > MAX_FILE_COUNT || bytes > MAX_UNPACKED_BYTES) {
          fail(new Error('Plugin archive exceeds extraction limits'));
          return;
        }
        let destination;
        try {
          destination = resolvePluginPath(targetDir, entry.fileName);
        } catch (error) {
          fail(error);
          return;
        }
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(destination, { recursive: true });
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          const output = fs.createWriteStream(destination, { flags: 'wx' });
          stream.pipe(output);
          output.on('finish', () => zipFile.readEntry());
          output.on('error', fail);
        });
      });
      zipFile.on('end', resolve);
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

function findPackageRoot(extractDir) {
  if (fs.existsSync(path.join(extractDir, 'manifest.json'))) return extractDir;
  const directories = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (directories.length !== 1) throw new Error('Archive must contain one plugin folder');
  const nested = path.join(extractDir, directories[0].name);
  if (!fs.existsSync(path.join(nested, 'manifest.json'))) throw new Error('manifest.json not found');
  return nested;
}

async function installFromRepo(repo) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || ''))) {
    return { success: false, error: 'Invalid repo (use owner/name)' };
  }
  const temporary = path.join(getPluginsDir(), `.download-${crypto.randomUUID()}`);
  try {
    fs.mkdirSync(temporary, { recursive: true });
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Dome-Plugin/1.0' },
    });
    if (!response.ok) throw new Error('Release not found');
    const release = await response.json();
    const asset = release.assets?.find((item) => item.name === 'dome-plugin.zip')
      || release.assets?.find((item) => item.name?.endsWith('.zip'));
    if (!asset?.browser_download_url) throw new Error('Release has no plugin ZIP asset');
    const buffer = await downloadBuffer(asset.browser_download_url);
    await extractZipBuffer(buffer, temporary);
    return installFromDir(findPackageRoot(temporary));
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function readAsset(pluginId, relativePath) {
  const plugin = listPlugins().find((item) => item.id === pluginId);
  if (!plugin) return { success: false, error: 'Plugin not found' };
  if (!plugin.enabled) return { success: false, error: 'Plugin is disabled' };
  try {
    const fullPath = resolvePluginPath(plugin.dir, relativePath);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Asset not found');
    if (stat.size > 5 * 1024 * 1024) throw new Error('Asset exceeds 5 MiB');
    const extension = path.extname(relativePath).toLowerCase();
    const buffer = fs.readFileSync(fullPath);
    const mimeTypes = {
      '.css': 'text/css', '.gif': 'image/gif', '.html': 'text/html', '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/markdown',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[extension];
    if (!mimeType) return { success: false, error: 'Unsupported asset type' };
    if (mimeType.startsWith('text/') || mimeType === 'application/json' || extension === '.js') {
      return { success: true, text: buffer.toString('utf8'), mimeType };
    }
    return { success: true, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  ensurePluginsDir,
  getPluginsDir,
  installBundled,
  installFromDir,
  installFromRepo,
  listPlugins,
  readAsset,
  setEnabled,
  uninstall,
  validateManifest,
};
