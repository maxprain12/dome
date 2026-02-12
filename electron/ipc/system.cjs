/* eslint-disable no-console */
const { shell, nativeTheme, dialog, BrowserWindow } = require('electron');

function register({ ipcMain, app, windowManager, validateSender, sanitizePath, validateUrl }) {
  // System paths
  ipcMain.handle('get-user-data-path', (event) => {
    try {
      validateSender(event, windowManager);
      return app.getPath('userData');
    } catch (error) {
      console.error('[IPC] Error in get-user-data-path:', error.message);
      throw error;
    }
  });

  ipcMain.handle('get-home-path', (event) => {
    try {
      validateSender(event, windowManager);
      return app.getPath('home');
    } catch (error) {
      console.error('[IPC] Error in get-home-path:', error.message);
      throw error;
    }
  });

  ipcMain.handle('get-app-version', (event) => {
    try {
      validateSender(event, windowManager);
      return app.getVersion();
    } catch (error) {
      console.error('[IPC] Error in get-app-version:', error.message);
      throw error;
    }
  });

  // File dialogs
  ipcMain.handle('select-file', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return [];

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        ...options,
      });

      return result.filePaths;
    } catch (error) {
      console.error('[IPC] Error in select-file:', error.message);
      throw error;
    }
  });

  ipcMain.handle('select-files', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return [];

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        ...options,
      });

      return result.filePaths;
    } catch (error) {
      console.error('[IPC] Error in select-files:', error.message);
      throw error;
    }
  });

  ipcMain.handle('select-folder', async (event) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return undefined;

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
      });

      return result.filePaths[0];
    } catch (error) {
      console.error('[IPC] Error in select-folder:', error.message);
      throw error;
    }
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return undefined;

      const result = await dialog.showSaveDialog(win, options);
      return result.filePath;
    } catch (error) {
      console.error('[IPC] Error in show-save-dialog:', error.message);
      throw error;
    }
  });

  // File system operations
  ipcMain.handle('open-path', async (event, filePath) => {
    try {
      validateSender(event, windowManager);
      const safePath = sanitizePath(filePath, true);
      return shell.openPath(safePath);
    } catch (error) {
      console.error('[IPC] Error in open-path:', error.message);
      throw error;
    }
  });

  ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    try {
      validateSender(event, windowManager);
      const safePath = sanitizePath(filePath, true);
      return shell.showItemInFolder(safePath);
    } catch (error) {
      console.error('[IPC] Error in show-item-in-folder:', error.message);
      throw error;
    }
  });

  // Open URL in default browser
  ipcMain.handle('open-external-url', async (event, url) => {
    try {
      validateSender(event, windowManager);
      const safeUrl = validateUrl(url);
      return shell.openExternal(safeUrl);
    } catch (error) {
      console.error('[IPC] Error in open-external-url:', error.message);
      throw error;
    }
  });

  // Theme
  ipcMain.handle('get-theme', (event) => {
    try {
      validateSender(event, windowManager);
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    } catch (error) {
      console.error('[IPC] Error in get-theme:', error.message);
      throw error;
    }
  });

  ipcMain.handle('set-theme', (event, theme) => {
    try {
      validateSender(event, windowManager);
      if (typeof theme !== 'string') {
        throw new Error('Theme must be a string');
      }
      if (!['auto', 'light', 'dark'].includes(theme)) {
        throw new Error('Invalid theme value. Must be "auto", "light", or "dark"');
      }
      if (theme === 'auto') {
        nativeTheme.themeSource = 'system';
      } else if (theme === 'light' || theme === 'dark') {
        nativeTheme.themeSource = theme;
      }
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    } catch (error) {
      console.error('[IPC] Error in set-theme:', error.message);
      throw error;
    }
  });

  nativeTheme.on('updated', () => {
    windowManager.broadcast('theme-changed', {
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    });
  });
}

module.exports = { register };
