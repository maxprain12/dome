/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function register({ ipcMain, app, windowManager, validateSender }) {
  ipcMain.handle('select-avatar', async (event) => {
    try {
      validateSender(event, windowManager);
      const { dialog } = require('electron');
      const mainWindow = windowManager.get('main');
      if (!mainWindow) return null;

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
        ],
        title: 'Select Avatar Image'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('[IPC] Error in select-avatar:', error.message);
      throw error;
    }
  });

  // Avatar copy to userData/avatars/
  ipcMain.handle('avatar:copy', async (event, sourcePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validate source path
      if (!sourcePath || typeof sourcePath !== 'string') {
        return { success: false, error: 'Invalid source path' };
      }

      // Check if source file exists
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      // Validate it's an image file
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const ext = path.extname(sourcePath).toLowerCase();
      if (!validExtensions.includes(ext)) {
        return { success: false, error: 'Invalid image file type' };
      }

      // Get userData path and ensure avatars directory exists
      const userDataPath = app.getPath('userData');
      const avatarsPath = path.join(userDataPath, 'avatars');

      if (!fs.existsSync(avatarsPath)) {
        fs.mkdirSync(avatarsPath, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `user-avatar-${timestamp}${ext}`;
      const destinationPath = path.join(avatarsPath, filename);

      // Copy file
      fs.copyFileSync(sourcePath, destinationPath);

      // Return relative path
      const relativePath = `avatars/${filename}`;

      console.log(`[Avatar] Copied avatar to ${relativePath}`);
      return { success: true, data: relativePath };
    } catch (error) {
      console.error('[Avatar] Error copying avatar:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete an avatar file
   */
  ipcMain.handle('avatar:delete', (event, relativePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!relativePath) {
        return { success: false, error: 'No path provided' };
      }

      // Validate path is within avatars directory
      const avatarsDir = path.join(app.getPath('userData'), 'avatars');
      const fullPath = path.join(app.getPath('userData'), relativePath);

      if (!fullPath.startsWith(avatarsDir)) {
        console.error('[Avatar] Attempted to delete file outside avatars directory:', fullPath);
        return { success: false, error: 'Invalid path' };
      }

      // Delete file if it exists
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log('[Avatar] Deleted:', relativePath);
        return { success: true };
      }

      // File doesn't exist - this is OK (might have been already deleted)
      console.log('[Avatar] File not found (already deleted?):', relativePath);
      return { success: true };

    } catch (error) {
      console.error('[Avatar] Error deleting avatar:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
