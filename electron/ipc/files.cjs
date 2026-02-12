/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function register({ ipcMain, app, windowManager, sanitizePath }) {
  ipcMain.handle('file:generateHash', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256')
        .update(buffer)
        .digest('hex')
        .slice(0, 16);

      return { success: true, data: hash };
    } catch (error) {
      console.error('[File] Error generating hash:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Read file contents
   */
  ipcMain.handle('file:readFile', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const buffer = fs.readFileSync(filePath);
      return { success: true, data: buffer };
    } catch (error) {
      console.error('[File] Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Read file as UTF-8 text (for JSON, .ipynb, etc.)
   * allowExternal: true - paths from user-selected files (Import dialog) may be outside userData
   */
  ipcMain.handle('file:readFileAsText', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const safePath = sanitizePath(filePath, true);
      const content = fs.readFileSync(safePath, 'utf8');
      return { success: true, data: content };
    } catch (error) {
      console.error('[File] Error reading file as text:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Write file as text (UTF-8)
   * allowExternal: true - paths from user-selected save location (Export dialog) may be outside userData
   */
  ipcMain.handle('file:writeFile', (event, filePath, content) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const safePath = sanitizePath(filePath, true);
      fs.writeFileSync(safePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[File] Error writing file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete a file
   */
  ipcMain.handle('file:deleteFile', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const safePath = sanitizePath(filePath);
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
        return { success: true };
      }
      return { success: false, error: 'File not found' };
    } catch (error) {
      console.error('[File] Error deleting file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List directory contents (for notebook workspace, etc.)
   * allowExternal: true - workspace folder is user-selected, can be anywhere
   */
  ipcMain.handle('file:listDirectory', (event, dirPath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const safePath = sanitizePath(dirPath, true);
      if (!fs.existsSync(safePath)) {
        return { success: false, error: 'Directory not found' };
      }
      const stat = fs.statSync(safePath);
      if (!stat.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
      const entries = fs.readdirSync(safePath, { withFileTypes: true });
      const items = entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(safePath, e.name),
      }));
      return { success: true, data: items };
    } catch (error) {
      console.error('[File] Error listing directory:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Copy file to destination (for adding files to notebook workspace)
   */
  ipcMain.handle('file:copyFile', (event, sourcePath, destPath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const safeSrc = sanitizePath(sourcePath, true);
      const safeDest = sanitizePath(destPath, true);
      if (!fs.existsSync(safeSrc)) {
        return { success: false, error: 'Source file not found' };
      }
      fs.copyFileSync(safeSrc, safeDest);
      return { success: true };
    } catch (error) {
      console.error('[File] Error copying file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get file information
   */
  ipcMain.handle('file:getInfo', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const stats = fs.statSync(filePath);
      const info = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      };

      return { success: true, data: info };
    } catch (error) {
      console.error('[File] Error getting file info:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Convert image to base64
   */
  ipcMain.handle('file:imageToBase64', (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { success: true, data: dataUrl };
    } catch (error) {
      console.error('[File] Error converting to base64:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Clean temporary files
   */
  ipcMain.handle('file:cleanTemp', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const tempDir = path.join(app.getPath('userData'), 'temp');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        let deleted = 0;

        files.forEach(file => {
          const filePath = path.join(tempDir, file);
          try {
            fs.unlinkSync(filePath);
            deleted++;
          } catch (err) {
            console.error('[File] Error deleting temp file:', err);
          }
        });

        return { success: true, data: { deleted } };
      }
      return { success: true, data: { deleted: 0 } };
    } catch (error) {
      console.error('[File] Error cleaning temp files:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Extract text from PDF
   */
  ipcMain.handle('file:extractPDFText', async (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const documentExtractor = require('../document-extractor.cjs');
      const text = await documentExtractor.extractTextFromPDF(filePath);
      return { success: true, data: text };
    } catch (error) {
      console.error('[File] Error extracting PDF text:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
