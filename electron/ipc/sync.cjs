/* eslint-disable no-console */
/**
 * IPC handlers for sync export/import
 * Export: ZIP with dome.db, dome-files/, manifest
 * Import: Extract ZIP to userData, restore data
 */

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { app, dialog, BrowserWindow } = require('electron');
const yauzl = require('yauzl');

function register({ ipcMain, windowManager, database, fileStorage, validateSender, sanitizePath }) {
  /**
   * Export all data to a ZIP file
   */
  ipcMain.handle('sync:export', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No window' };
    }

    try {
      const defaultPath = path.join(app.getPath('documents'), `dome-export-${Date.now()}.zip`);
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Export Dome Data',
        defaultPath,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });

      if (!filePath) {
        return { success: false, cancelled: true };
      }

      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dome.db');
      const domeFilesPath = path.join(userDataPath, 'dome-files');

      const manifest = {
        version: app.getVersion(),
        exportedAt: new Date().toISOString(),
        domeVersion: app.getVersion(),
      };

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        output.on('close', () => {
          resolve({ success: true, path: filePath });
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'dome.db' });
        }

        if (fs.existsSync(domeFilesPath)) {
          archive.directory(domeFilesPath, 'dome-files');
        }

        archive.finalize();
      });
    } catch (error) {
      console.error('[Sync] Export error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Import data from a ZIP file
   */
  ipcMain.handle('sync:import', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No window' };
    }

    try {
      const { filePaths } = await dialog.showOpenDialog(win, {
        title: 'Import Dome Data',
        properties: ['openFile'],
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const zipPath = sanitizePath(filePaths[0], true);
      if (!zipPath) {
        return { success: false, error: 'Invalid path' };
      }

      const userDataPath = app.getPath('userData');
      const tempDir = path.join(userDataPath, 'temp', `sync-import-${Date.now()}`);

      fs.mkdirSync(tempDir, { recursive: true });

      await new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zf) => {
          if (err) return reject(err);

          zf.on('end', () => resolve());
          zf.on('error', (e) => {
            reject(e);
          });

          zf.on('entry', (entry) => {
            try {
              const sanitizeEntryPath = (entryFileName) => {
                const normalized = path.normalize(entryFileName);
                if (normalized.includes('\0')) {
                  throw new Error('Path contains null byte');
                }
                // '..' is intentionally allowed through — the resolveWithinTempDir
                // check below guards against traversal out of tempDir.
                return normalized;
              };

              const resolveWithinTempDir = (fileName) => {
                const sanitized = sanitizeEntryPath(fileName);
                const joined = path.join(tempDir, sanitized);
                const resolved = path.resolve(joined);
                const resolvedTempDir = path.resolve(tempDir);
                if (!resolved.startsWith(resolvedTempDir + path.sep)) {
                  throw new Error('Path traversal detected: ' + fileName);
                }
                return resolved;
              };

              if (/\/$/.test(entry.fileName)) {
                const dirPath = resolveWithinTempDir(entry.fileName);
                fs.mkdirSync(dirPath, { recursive: true });
                try {
                  zf.readEntry();
                } catch (readErr) {
                  reject(readErr);
                }
                return;
              }

              if (!validateSender(event)) {
                reject(new Error('Unauthorized'));
                return;
              }

              zf.openReadStream(entry, (openErr, readStream) => {
                if (openErr) {
                  reject(openErr);
                  return;
                }
                const destPath = resolveWithinTempDir(entry.fileName);
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                const writeStream = fs.createWriteStream(destPath);
                readStream.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', () => {
                  try {
                    zf.readEntry();
                  } catch (readErr) {
                    reject(readErr);
                  }
                });
                readStream.pipe(writeStream);
              });
            } catch (err) {
              reject(err);
            }
          });

          try {
            zf.readEntry();
          } catch (readErr) {
            reject(readErr);
          }
        });
      });

      database.closeDB();

      const dbSource = path.join(tempDir, 'dome.db');
      const dbDest = path.join(userDataPath, 'dome.db');

      if (fs.existsSync(dbSource)) {
        fs.copyFileSync(dbSource, dbDest);
      }

      const domeFilesSource = path.join(tempDir, 'dome-files');
      const domeFilesDest = path.join(userDataPath, 'dome-files');

      if (fs.existsSync(domeFilesSource)) {
        if (fs.existsSync(domeFilesDest)) {
          fs.rmSync(domeFilesDest, { recursive: true });
        }
        fs.renameSync(domeFilesSource, domeFilesDest);
      }

      fs.rmSync(tempDir, { recursive: true, force: true });

      database.initDatabase();

      return { success: true, restartRequired: true };
    } catch (error) {
      console.error('[Sync] Import error:', error);
      database.initDatabase().catch(() => {});
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
