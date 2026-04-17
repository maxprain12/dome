/* eslint-disable no-console */
/**
 * IPC handlers for plugin management
 *
 * SECURITY NOTE on path traversal:
 * Zip extraction (install-from-repo) uses resolveWithinExtractDir() which performs
 * containment checking via path.resolve() + startsWith(baseDir + path.sep).
 * This correctly handles '..' components because path.resolve() normalizes them
 * and the containment check prevents escape. The explicit replace(/\.\.\//g, '')
 * was removed because the resolver provides stronger guarantees (handles all
 * path forms including Windows, symbolic links, etc.).
 *
 * For install-from-folder, the path comes from Electron's native dialog (user-selected),
 * so path traversal is not a concern in that flow.
 */

const path = require('path');
const fs = require('fs');
const { dialog, BrowserWindow } = require('electron');
const pluginLoader = require('../plugin-loader.cjs');

function register({ ipcMain, windowManager, validateSender, sanitizePath }) {
  ipcMain.handle('plugin:list', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const plugins = pluginLoader.listPlugins();
      return { success: true, data: plugins };
    } catch (err) {
      console.error('[Plugins] list error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plugin:install-from-folder', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No window' };
    }

    try {
      const { filePaths } = await dialog.showOpenDialog(win, {
        title: 'Select plugin folder',
        properties: ['openDirectory'],
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const sourceDir = sanitizePath(filePaths[0], true);
      const result = pluginLoader.installFromDir(sourceDir);
      return result;
    } catch (err) {
      console.error('[Plugins] install error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plugin:uninstall', async (event, pluginId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return pluginLoader.uninstall(pluginId);
    } catch (err) {
      console.error('[Plugins] uninstall error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plugin:setEnabled', async (event, pluginId, enabled) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return pluginLoader.setEnabled(pluginId, enabled);
    } catch (err) {
      console.error('[Plugins] setEnabled error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plugin:read-asset', async (event, pluginId, relativePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!pluginId || typeof pluginId !== 'string' || !relativePath || typeof relativePath !== 'string') {
      return { success: false, error: 'Invalid pluginId or relativePath' };
    }
    if (!/^[a-z0-9-]+$/i.test(pluginId)) {
      return { success: false, error: 'Invalid plugin id format' };
    }
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      return { success: false, error: 'Path traversal not allowed' };
    }

    try {
      const plugins = pluginLoader.listPlugins();
      const plugin = plugins.find((p) => p.id === pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };
      if (!plugin.enabled) return { success: false, error: 'Plugin is disabled' };

      const fullPath = path.join(plugin.dir, relativePath);
      const normalizedPath = path.normalize(fullPath);
      if (!normalizedPath.startsWith(path.normalize(plugin.dir))) {
        return { success: false, error: 'Path outside plugin directory' };
      }

      if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isFile()) {
        return { success: false, error: 'Asset not found' };
      }

      const ext = path.extname(relativePath).toLowerCase();
      const buf = fs.readFileSync(normalizedPath);

      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
        const mime = mimeMap[ext] || 'application/octet-stream';
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        return { success: true, dataUrl };
      }
      if (['.txt', '.html', '.css', '.js', '.json', '.md'].includes(ext)) {
        return { success: true, text: buf.toString('utf8') };
      }
      return { success: false, error: 'Unsupported asset type' };
    } catch (err) {
      console.error('[Plugins] read-asset error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plugin:install-from-repo', async (event, repo) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!repo || typeof repo !== 'string' || !repo.includes('/')) {
      return { success: false, error: 'Invalid repo (use owner/name)' };
    }

    try {
      const [owner, name] = repo.split('/').map((s) => s.trim());
      if (!owner || !name) return { success: false, error: 'Invalid repo format' };

      const apiUrl = `https://api.github.com/repos/${owner}/${name}/releases/latest`;
      const res = await fetch(apiUrl);
      if (!res.ok) return { success: false, error: 'Release not found' };

      const release = await res.json();
      const zipAsset = release.assets?.find(
        (a) => a.name.endsWith('.zip') && !a.name.includes('Source')
      );
      if (!zipAsset) return { success: false, error: 'No .zip asset in release' };

      const { app } = require('electron');
      const tempDir = path.join(app.getPath('temp'), `dome-plugin-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const zipPath = path.join(tempDir, zipAsset.name);

      const zipRes = await fetch(zipAsset.browser_download_url);
      if (!zipRes.ok) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return { success: false, error: 'Download failed' };
      }
      const buf = await zipRes.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(buf));

      const extractDir = path.join(tempDir, 'extract');
      fs.mkdirSync(extractDir, { recursive: true });

      const yauzl = require('yauzl');
      await new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
          if (err) return reject(err);
          zipfile.readEntry();
          zipfile.on('entry', (entry) => {
            const sanitizeEntryPath = (entryFileName) => {
              const normalized = path.normalize(entryFileName);
              if (normalized.includes('\0')) {
                throw new Error('Path contains null byte');
              }
              // Note: '..' is allowed through here because resolveWithinExtractDir
              // catches path traversal via containment check (startsWith baseDir + sep).
              // This is secure because path.resolve normalizes '..' components.
              return normalized;
            };

            const resolveWithinExtractDir = (fileName) => {
              const sanitized = sanitizeEntryPath(fileName);
              const joined = path.join(extractDir, sanitized);
              const resolved = path.resolve(joined);
              const resolvedExtractDir = path.resolve(extractDir);
              if (!resolved.startsWith(resolvedExtractDir + path.sep)) {
                throw new Error('Path traversal detected: ' + fileName);
              }
              return resolved;
            };

            if (/\/$/.test(entry.fileName)) {
              const dirPath = resolveWithinExtractDir(entry.fileName);
              fs.mkdirSync(dirPath, { recursive: true });
              zipfile.readEntry();
              return;
            }
            zipfile.openReadStream(entry, (openErr, readStream) => {
              if (openErr) return reject(openErr);
              const destPath = resolveWithinExtractDir(entry.fileName);
              fs.mkdirSync(path.dirname(destPath), { recursive: true });
              const writeStream = fs.createWriteStream(destPath);
              readStream.pipe(writeStream);
              writeStream.on('finish', () => zipfile.readEntry());
              writeStream.on('error', reject);
            });
          });
          zipfile.on('end', () => resolve());
          zipfile.on('error', reject);
        });
      });

      const topLevel = fs.readdirSync(extractDir);
      const sourceDir = topLevel.length === 1
        ? path.join(extractDir, topLevel[0])
        : extractDir;

      const result = pluginLoader.installFromDir(sourceDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return result;
    } catch (err) {
      console.error('[Plugins] install-from-repo error:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
