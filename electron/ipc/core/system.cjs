/* eslint-disable no-console */
const { shell, nativeTheme, dialog, BrowserWindow } = require('electron');

function register({ ipcMain, app, windowManager, validateSender, sanitizePath, validateUrl }) {
  // System paths
  ipcMain.handle('get-user-data-path', (event) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: app.getPath('userData') };
    } catch (error) {
      console.error('[IPC] Error in get-user-data-path:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-home-path', (event) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: app.getPath('home') };
    } catch (error) {
      console.error('[IPC] Error in get-home-path:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-app-version', (event) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: app.getVersion() };
    } catch (error) {
      console.error('[IPC] Error in get-app-version:', error.message);
      return { success: false, error: error.message };
    }
  });

  // File dialogs
  ipcMain.handle('select-file', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return { success: true, data: [] };

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        ...options,
      });

      return { success: true, data: result.filePaths };
    } catch (error) {
      console.error('[IPC] Error in select-file:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-files', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return { success: true, data: [] };

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        ...options,
      });

      return { success: true, data: result.filePaths };
    } catch (error) {
      console.error('[IPC] Error in select-files:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-folder', async (event) => {
    try {
      validateSender(event, windowManager);
      let win =
        BrowserWindow.fromWebContents(event.sender) ||
        (windowManager.getFocused && windowManager.getFocused()) ||
        windowManager.get('main');
      if (!win || win.isDestroyed()) return { success: true, data: undefined };
      if (win.isMinimized()) win.restore();
      win.focus();

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
      });

      return { success: true, data: result.filePaths[0] };
    } catch (error) {
      console.error('[IPC] Error in select-folder:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      validateSender(event, windowManager);
      const win = BrowserWindow.fromWebContents(event.sender) || windowManager.get('main');
      if (!win || win.isDestroyed()) return { success: true, data: undefined };

      const result = await dialog.showSaveDialog(win, options);
      return { success: true, data: result.filePath };
    } catch (error) {
      console.error('[IPC] Error in show-save-dialog:', error.message);
      return { success: false, error: error.message };
    }
  });

  // File system operations
  ipcMain.handle('open-path', async (event, filePath) => {
    try {
      validateSender(event, windowManager);
      const safePath = sanitizePath(filePath, true);
      return { success: true, data: await shell.openPath(safePath) };
    } catch (error) {
      console.error('[IPC] Error in open-path:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    try {
      validateSender(event, windowManager);
      const safePath = sanitizePath(filePath, true);
      return { success: true, data: await shell.showItemInFolder(safePath) };
    } catch (error) {
      console.error('[IPC] Error in show-item-in-folder:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Open URL in default browser
  ipcMain.handle('open-external-url', async (event, url) => {
    try {
      validateSender(event, windowManager);
      const safeUrl = validateUrl(url);
      return { success: true, data: await shell.openExternal(safeUrl) };
    } catch (error) {
      console.error('[IPC] Error in open-external-url:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Theme
  ipcMain.handle('get-theme', (event) => {
    try {
      validateSender(event, windowManager);
      const source = nativeTheme.themeSource;
      if (source === 'system') return { success: true, data: 'auto' };
      return { success: true, data: source }; // 'light' | 'dark'
    } catch (error) {
      console.error('[IPC] Error in get-theme:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-theme', (event, theme) => {
    try {
      validateSender(event, windowManager);
      if (!['light', 'dark', 'auto'].includes(theme)) {
        return { success: false, error: `Invalid theme: ${theme}` };
      }
      nativeTheme.themeSource = theme === 'auto' ? 'system' : theme;
      return { success: true, data: theme };
    } catch (error) {
      console.error('[IPC] Error in set-theme:', error.message);
      return { success: false, error: error.message };
    }
  });

  nativeTheme.on('updated', () => {
    const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    windowManager.broadcast('theme-changed', { theme: resolved });
  });

  // Auto-launch (start with system)
  ipcMain.handle('system:get-login-item', (event) => {
    try {
      validateSender(event, windowManager);
      const settings = app.getLoginItemSettings();
      return { success: true, data: { openAtLogin: settings.openAtLogin } };
    } catch (error) {
      console.error('[IPC] Error in system:get-login-item:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system:set-login-item', (event, openAtLogin) => {
    try {
      validateSender(event, windowManager);
      app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
      return { success: true, data: { openAtLogin: Boolean(openAtLogin) } };
    } catch (error) {
      console.error('[IPC] Error in system:set-login-item:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system:get-app-locale', (event) => {
    try {
      validateSender(event, windowManager);
      return { success: true, data: app.getLocale() };
    } catch (error) {
      console.error('[IPC] Error in system:get-app-locale:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Quit the app (used from settings or tray)
  ipcMain.handle('system:quit', (event) => {
    try {
      validateSender(event, windowManager);
      app.quit();
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error in system:quit:', error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
