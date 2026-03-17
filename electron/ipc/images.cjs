/* eslint-disable no-console */
/**
 * Image IPC Handlers
 * Handles image processing operations like crop, resize, thumbnail
 */

function register({ ipcMain, windowManager, cropImage }) {
  /**
   * Crop an image
   */
  ipcMain.handle('image:crop', async (event, options) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await cropImage.cropImage(options.filePath, {
        x: options.x || 0,
        y: options.y || 0,
        width: options.width,
        height: options.height,
        format: options.format || 'jpeg',
        quality: options.quality || 90,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
      });
      return result;
    } catch (error) {
      console.error('[Image] Error cropping:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Resize an image
   */
  ipcMain.handle('image:resize', async (event, options) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await cropImage.resizeImage(options.filePath, {
        width: options.width,
        height: options.height,
        fit: options.fit || 'inside',
        format: options.format || 'jpeg',
        quality: options.quality || 90,
      });
      return result;
    } catch (error) {
      console.error('[Image] Error resizing:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Generate thumbnail
   */
  ipcMain.handle('image:thumbnail', async (event, options) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await cropImage.generateThumbnail(options.filePath, {
        maxWidth: options.maxWidth || 400,
        maxHeight: options.maxHeight || 400,
        quality: options.quality || 80,
        format: options.format || 'jpeg',
      });
      return result;
    } catch (error) {
      console.error('[Image] Error generating thumbnail:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get image metadata
   */
  ipcMain.handle('image:metadata', async (event, filePath) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await cropImage.getImageMetadata(filePath);
      return result;
    } catch (error) {
      console.error('[Image] Error getting metadata:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
