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
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
          if (err) return reject(err);

          zipfile.readEntry();
          zipfile.on('entry', (entry) => {
            if (/\/$/.test(entry.fileName)) {
              const dirPath = path.join(tempDir, entry.fileName);
              fs.mkdirSync(dirPath, { recursive: true });
              zipfile.readEntry();
              return;
            }

            zipfile.openReadStream(entry, (openErr, readStream) => {
              if (openErr) return reject(openErr);
              const destPath = path.join(tempDir, entry.fileName);
              fs.mkdirSync(path.dirname(destPath), { recursive: true });
              const writeStream = fs.createWriteStream(destPath);
              readStream.pipe(writeStream);
              writeStream.on('finish', () => {
                zipfile.readEntry();
              });
              writeStream.on('error', reject);
            });
          });
          zipfile.on('end', () => resolve());
          zipfile.on('error', reject);
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
