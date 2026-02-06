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
