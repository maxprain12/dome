/* eslint-disable no-console */
const { BrowserWindow } = require('electron');

function register({ ipcMain, nativeTheme, windowManager, database }) {
  ipcMain.handle('window:create', (event, { id, route = '/', options = {} }) => {
    // Validar que el sender está autorizado
    if (!windowManager.isAuthorized(event.sender.id)) {
      console.error('[IPC] Unauthorized window creation attempt');
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar parámetros
      if (!id || typeof id !== 'string' || id.length > 100) {
        throw new Error('Invalid window id. Must be a non-empty string with max 100 characters');
      }
      if (route && (typeof route !== 'string' || route.length > 500)) {
        throw new Error('Invalid route. Must be a string with max 500 characters');
      }
      if (options && (typeof options !== 'object' || Array.isArray(options))) {
        throw new Error('Invalid options. Must be an object');
      }
      const window = windowManager.create(id, options, route);
      return { success: true, windowId: id };
    } catch (error) {
      console.error('[IPC] Error creating window:', error);
      return { success: false, error: error.message };
    }
  });

  // Crear ventana modal
  ipcMain.handle('window:create-modal', (event, { parentId, id, route = '/', options = {} }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar parámetros
      if (!parentId || typeof parentId !== 'string' || parentId.length > 100) {
        throw new Error('Invalid parentId. Must be a non-empty string with max 100 characters');
      }
      if (!id || typeof id !== 'string' || id.length > 100) {
        throw new Error('Invalid window id. Must be a non-empty string with max 100 characters');
      }
      if (route && (typeof route !== 'string' || route.length > 500)) {
        throw new Error('Invalid route. Must be a string with max 500 characters');
      }
      if (options && (typeof options !== 'object' || Array.isArray(options))) {
        throw new Error('Invalid options. Must be an object');
      }
      const window = windowManager.createModal(parentId, id, options, route);
      if (window) {
        return { success: true, windowId: id };
      }
      return { success: false, error: 'Parent window not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cerrar ventana
  ipcMain.handle('window:close', (event, windowId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar windowId
      if (!windowId || typeof windowId !== 'string' || windowId.length > 100) {
        throw new Error('Invalid windowId. Must be a non-empty string with max 100 characters');
      }
      windowManager.close(windowId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Minimizar ventana actual (Windows/Linux title bar)
  ipcMain.handle('window:minimize-current', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { success: false };
    win.minimize();
    return { success: true };
  });

  // Maximizar / restaurar ventana actual (Windows/Linux title bar)
  ipcMain.handle('window:maximize-toggle', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { success: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { success: true };
  });

  // Cerrar ventana actual (Windows/Linux title bar)
  ipcMain.handle('window:close-current', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { success: false };
    win.close();
    return { success: true };
  });

  // Obtener ventanas activas
  ipcMain.handle('window:list', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const windows = windowManager.getAll().map((w) => ({
      id: w.id,
      title: w.getTitle(),
      focused: w.isFocused(),
    }));

    return { success: true, windows };
  });

  // Broadcast mensaje a todas las ventanas
  ipcMain.handle('window:broadcast', (event, { channel, data }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar channel
      if (!channel || typeof channel !== 'string' || channel.length > 100) {
        throw new Error('Invalid channel. Must be a non-empty string with max 100 characters');
      }
      // Validar que el canal no contenga caracteres peligrosos
      if (!/^[a-zA-Z0-9:_-]+$/.test(channel)) {
        throw new Error('Invalid channel format. Only alphanumeric, colon, underscore, and hyphen allowed');
      }
      // Validar data (debe ser serializable)
      if (data !== undefined && data !== null) {
        try {
          JSON.stringify(data);
        } catch (e) {
          throw new Error('Invalid data. Must be JSON serializable');
        }
      }
      windowManager.broadcast(channel, data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Open workspace window for a resource
  ipcMain.handle('window:open-workspace', async (event, { resourceId, resourceType }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar parámetros
      if (!resourceId || typeof resourceId !== 'string' || resourceId.length > 200) {
        throw new Error('resourceId must be a non-empty string with max 200 characters');
      }
      if (resourceType && (typeof resourceType !== 'string' || resourceType.length > 50)) {
        throw new Error('resourceType must be a string with max 50 characters');
      }
      // Get resource for the title
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // Check if workspace already exists
      const windowId = `workspace-${resourceId}`;
      const existingWindow = windowManager.get(windowId);
      if (existingWindow) {
        existingWindow.focus();
        return {
          success: true,
          data: {
            windowId,
            resourceId,
            title: resource.title
          }
        };
      }

      // Determine the route based on resource type
      // Use query parameters instead of dynamic routes for production compatibility
      // Next.js static export doesn't support dynamic routes like /note/[id]
      let route;
      if (resourceType === 'note') {
        route = `/workspace/note?id=${resourceId}`;
      } else if (resourceType === 'url') {
        let metadata = {};
        try {
          metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
        } catch (e) { /* ignore */ }
        const isYouTube = metadata.url_type === 'youtube' || !!metadata.video_id;
        route = isYouTube ? `/workspace/youtube?id=${resourceId}` : `/workspace/url?id=${resourceId}`;
      } else if (resourceType === 'notebook') {
        route = `/workspace/notebook?id=${resourceId}`;
      } else {
        route = `/workspace?id=${resourceId}`;
      }

      // Create window
      const window = windowManager.create(
        windowId,
        {
          width: 1400,
          height: 900,
          minWidth: 900,
          minHeight: 600,
          title: `${resource.title} - Dome`,
          backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1419' : '#ffffff',
        },
        route
      );

      console.log(`[Workspace] Opened workspace for: ${resource.title}`);

      return {
        success: true,
        data: {
          windowId,
          resourceId,
          title: resource.title
        }
      };
    } catch (error) {
      console.error('[Workspace] Error opening workspace:', error);
      return { success: false, error: error.message };
    }
  });

  // Open settings window
  ipcMain.handle('window:open-settings', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Check if settings window already exists
      const existingWindow = windowManager.get('settings');
      if (existingWindow) {
        existingWindow.focus();
        return { success: true, windowId: 'settings' };
      }

      // Create new settings window
      const settingsWindow = windowManager.create(
        'settings',
        {
          width: 900,
          height: 700,
          minWidth: 800,
          minHeight: 600,
          backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1419' : '#ffffff',
          title: 'Settings - Dome',
        },
        '/settings'
      );

      return { success: true, windowId: 'settings' };
    } catch (error) {
      console.error('[IPC] Error opening settings window:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
