/* eslint-disable no-console */
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  Menu,
  protocol,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// Register custom protocol scheme as privileged before app is ready
// This allows the app:// protocol to work like https:// with full privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
const windowManager = require('./window-manager.cjs');
const database = require('./database.cjs');
const initModule = require('./init.cjs');
const fileStorage = require('./file-storage.cjs');
const thumbnail = require('./thumbnail.cjs');
const webScraper = require('./web-scraper.cjs');
const youtubeService = require('./youtube-service.cjs');
const ollamaService = require('./ollama-service.cjs');
const aiToolsHandler = require('./ai-tools-handler.cjs');
const vectorHandler = require('./vector-handler.cjs');
const documentExtractor = require('./document-extractor.cjs');
const { validateSender, sanitizePath, validateUrl } = require('./security.cjs');

// Environment detection
const isDev = process.env.NODE_ENV === 'development' ||
  !app.isPackaged ||
  !fs.existsSync(path.join(__dirname, '../out/index.html'));
const isDebug = isDev || process.env.DEBUG_PROD === 'true';

// Create application menu with Edit submenu for copy/paste/etc.
const menuTemplate = [
  // macOS app menu
  ...(process.platform === 'darwin' ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : []),
  // Edit menu - required for copy/paste shortcuts
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      ...(process.platform === 'darwin' ? [
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' }
          ]
        }
      ] : [])
    ]
  },
  // View menu
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  // Window menu
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(process.platform === 'darwin' ? [
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ] : [
        { role: 'close' }
      ])
    ]
  }
];
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

// Setup user data folder
function setupUserDataFolder() {
  const userDataPath = app.getPath('userData');
  const domePath = path.join(userDataPath, 'dome-files');

  if (!fs.existsSync(domePath)) {
    fs.mkdirSync(domePath, { recursive: true });
  }

  console.log('📁 User data path:', userDataPath);
}

// Install development tools
async function installExtensions() {
  if (!isDev) return;

  try {
    const {
      default: installExtension,
      REACT_DEVELOPER_TOOLS,
    } = require('electron-devtools-installer');

    await installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
      forceDownload: false,
    });
    console.log('✅ React DevTools installed');
  } catch (error) {
    console.error('❌ Error installing extensions:', error);
  }
}

// Create main window
async function createWindow() {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../assets');

  const getAssetPath = (...paths) => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  // Usar WindowManager para crear la ventana principal
  const mainWindow = windowManager.create(
    'main',
    {
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 768,
      icon: fs.existsSync(getAssetPath('icon.png'))
        ? getAssetPath('icon.png')
        : undefined,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1419' : '#ffffff',
    },
    '/'
  );

  // Show window when ready
  mainWindow.on('ready-to-show', () => {
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Enable DevTools in production with Cmd+Shift+I (Mac) or Ctrl+Shift+I (Windows/Linux)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? input.meta : input.control;
    if (modifierKey && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  return mainWindow;
}

// App lifecycle events
app.on('window-all-closed', () => {
  // Respect macOS convention of keeping app in memory
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Re-create window on macOS when dock icon is clicked
  if (windowManager.count() === 0) {
    createWindow();
  }
});

// Initialize app
app
  .whenReady()
  .then(async () => {
    // Register custom protocol handler for serving static files
    // This allows Next.js static export to work with absolute paths like /_next/static/...
    const outDir = path.join(__dirname, '../out');
    console.log('[Protocol] Registering app:// protocol, serving from:', outDir);
    
    // Cache for file paths to avoid repeated fs.existsSync calls
    const fileCache = new Map();
    const CACHE_TTL = 60000; // 1 minute cache TTL

    protocol.handle('app', (request) => {
      // Parse the URL and get the pathname
      const url = new URL(request.url);
      let filePath = url.pathname;

      // Remove leading slash and decode URI components
      filePath = decodeURIComponent(filePath);
      if (filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      // Default to index.html for root or directory requests
      if (!filePath || filePath.endsWith('/')) {
        filePath = filePath + 'index.html';
      }

      // Construct the full file path
      const fullPath = path.join(outDir, filePath);

      // Security: ensure the path is within outDir
      const normalizedPath = path.normalize(fullPath);
      if (!normalizedPath.startsWith(outDir)) {
        console.error('[Protocol] Security: path traversal attempt blocked:', filePath);
        return new Response('Forbidden', { status: 403 });
      }

      // Check cache first
      const cacheKey = normalizedPath;
      const cached = fileCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        if (cached.exists) {
          return net.fetch(pathToFileURL(cached.path).href);
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      // Check if file exists (minimize fs calls)
      try {
        const stats = fs.statSync(normalizedPath);
        if (stats.isDirectory()) {
          const indexPath = path.join(normalizedPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            fileCache.set(cacheKey, { exists: true, path: indexPath, timestamp: Date.now() });
            return net.fetch(pathToFileURL(indexPath).href);
          }
          fileCache.set(cacheKey, { exists: false, timestamp: Date.now() });
          return new Response('Not Found', { status: 404 });
        }
        // Regular file
        fileCache.set(cacheKey, { exists: true, path: normalizedPath, timestamp: Date.now() });
        return net.fetch(pathToFileURL(normalizedPath).href);
      } catch (err) {
        // File doesn't exist, try with .html extension for Next.js routes
        const htmlPath = normalizedPath + '.html';
        if (fs.existsSync(htmlPath)) {
          fileCache.set(cacheKey, { exists: true, path: htmlPath, timestamp: Date.now() });
          return net.fetch(pathToFileURL(htmlPath).href);
        }
        // Try index.html in directory
        const indexPath = path.join(normalizedPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          fileCache.set(cacheKey, { exists: true, path: indexPath, timestamp: Date.now() });
          return net.fetch(pathToFileURL(indexPath).href);
        }
        fileCache.set(cacheKey, { exists: false, timestamp: Date.now() });
        return new Response('Not Found', { status: 404 });
      }
    });
    
    console.log('[Protocol] app:// protocol registered successfully');
    
    setupUserDataFolder();
    // Initialize file storage
    fileStorage.initStorage();
    // Initialize vector handler
    vectorHandler.initialize(app.getPath('userData')).catch(console.error);
    // Database initialization is now handled by initModule
    // but we still need to ensure it's ready
    database.initDatabase();
    
    // IMPORTANTE: Crear ventana PRIMERO para que la UI se muestre inmediatamente
    // La inicializacion de LanceDB puede fallar o bloquearse con modulos nativos
    createWindow();
    
    // Initialize the app in background (SQLite settings, LanceDB, filesystem)
    // No bloquea la UI - si falla, la app sigue funcionando sin busqueda vectorial
    initModule.initializeApp().catch(err => {
      console.error('❌ Background initialization failed:', err);
      console.warn('⚠️ Vector search will be disabled');
    });
  })
  .catch(console.error);

// Cleanup before quit
app.on('before-quit', () => {
  console.log('👋 Cerrando Dome...');
  database.closeDB();
});

// ============================================
// IPC HANDLERS
// ============================================

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
    const { dialog } = require('electron');
    const mainWindow = windowManager.get('main');
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, {
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
    const { dialog } = require('electron');
    const mainWindow = windowManager.get('main');
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, {
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
    const { dialog } = require('electron');
    const mainWindow = windowManager.get('main');
    if (!mainWindow) return undefined;

    const result = await dialog.showOpenDialog(mainWindow, {
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
    const { dialog } = require('electron');
    const mainWindow = windowManager.get('main');
    if (!mainWindow) return undefined;

    const result = await dialog.showSaveDialog(mainWindow, options);
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
    // Allow external paths for shell.openPath (user might want to open external files)
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
    // Allow external paths for show-item-in-folder (user might want to show external files)
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
    // Validar tipo y valor del tema
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

// Avatar selection
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

// ============================================
// WINDOW MANAGEMENT IPC HANDLERS
// ============================================

// Crear nueva ventana
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
      route = `/workspace/url?id=${resourceId}`;
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

// ============================================
// INITIALIZATION IPC HANDLERS
// ============================================

// Initialize app
ipcMain.handle('init:initialize', async (event) => {
  try {
    validateSender(event, windowManager);
    return await initModule.initializeApp();
  } catch (error) {
    console.error('[INIT] Error initializing app:', error);
    return {
      success: false,
      error: error.message,
      needsOnboarding: true,
    };
  }
});

// Check onboarding status
ipcMain.handle('init:check-onboarding', (event) => {
  try {
    validateSender(event, windowManager);
    return {
      success: true,
      needsOnboarding: initModule.checkOnboardingStatus(),
    };
  } catch (error) {
    console.error('[INIT] Error checking onboarding:', error);
    return {
      success: false,
      error: error.message,
      needsOnboarding: true,
    };
  }
});

// Get initialization status
ipcMain.handle('init:get-status', (event) => {
  try {
    validateSender(event, windowManager);
    return {
      success: true,
      isInitialized: initModule.isInitialized(),
    };
  } catch (error) {
    console.error('[IPC] Error in init:get-status:', error.message);
    throw error;
  }
});

// ============================================
// DATABASE IPC HANDLERS
// ============================================

// Projects
ipcMain.handle('db:projects:create', (event, project) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.createProject.run(
      project.id,
      project.name,
      project.description || null,
      project.parent_id || null,
      project.created_at,
      project.updated_at
    );

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('project:created', project);

    return { success: true, data: project };
  } catch (error) {
    console.error('[DB] Error creating project:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:projects:getAll', (event) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const projects = queries.getProjects.all();
    return { success: true, data: projects };
  } catch (error) {
    console.error('[DB] Error getting projects:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:projects:getById', (event, id) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const project = queries.getProjectById.get(id);
    return { success: true, data: project };
  } catch (error) {
    console.error('[DB] Error getting project:', error);
    return { success: false, error: error.message };
  }
});

// Resources
ipcMain.handle('db:resources:create', (event, resource) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.createResource.run(
      resource.id,
      resource.project_id,
      resource.type,
      resource.title,
      resource.content || null,
      resource.file_path || null,
      resource.metadata ? JSON.stringify(resource.metadata) : null,
      resource.created_at,
      resource.updated_at
    );

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('resource:created', resource);

    return { success: true, data: resource };
  } catch (error) {
    console.error('[DB] Error creating resource:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:resources:getByProject', (event, projectId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const resources = queries.getResourcesByProject.all(projectId);
    return { success: true, data: resources };
  } catch (error) {
    console.error('[DB] Error getting resources:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:resources:getById', (event, id) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(id);
    return { success: true, data: resource };
  } catch (error) {
    console.error('[DB] Error getting resource:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:resources:update', (event, resource) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.updateResource.run(
      resource.title,
      resource.content || null,
      resource.metadata ? JSON.stringify(resource.metadata) : null,
      resource.updated_at,
      resource.id
    );

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('resource:updated', {
      id: resource.id,
      updates: resource
    });

    return { success: true, data: resource };
  } catch (error) {
    console.error('[DB] Error updating resource:', error);
    
    // Try to handle corruption errors
    const handled = database.handleCorruptionError(error);
    if (handled) {
      // Retry the operation after repair
      // Queries are automatically invalidated by handleCorruptionError
      try {
        // Get fresh queries after repair
        const queries = database.getQueries();
        queries.updateResource.run(
          resource.title,
          resource.content || null,
          resource.metadata ? JSON.stringify(resource.metadata) : null,
          resource.updated_at,
          resource.id
        );

        windowManager.broadcast('resource:updated', {
          id: resource.id,
          updates: resource
        });

        return { success: true, data: resource };
      } catch (retryError) {
        console.error('[DB] Error retrying after repair:', retryError);
        // If it's still corrupt, try one more repair cycle
        if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
          console.warn('[DB] Corruption persists, attempting more aggressive repair...');
          database.invalidateQueries();
          const repairedAgain = database.repairFTSTables();
          if (repairedAgain) {
            try {
              const queries = database.getQueries();
              queries.updateResource.run(
                resource.title,
                resource.content || null,
                resource.metadata ? JSON.stringify(resource.metadata) : null,
                resource.updated_at,
                resource.id
              );
              windowManager.broadcast('resource:updated', {
                id: resource.id,
                updates: resource
              });
              return { success: true, data: resource };
            } catch (finalError) {
              console.error('[DB] Error after second repair attempt:', finalError);
              return { success: false, error: finalError.message };
            }
          }
        }
        return { success: false, error: retryError.message };
      }
    }
    
    return { success: false, error: error.message };
  }
});

// Search
ipcMain.handle('db:resources:search', (event, query) => {
  try {
    validateSender(event, windowManager);
    // Validar query
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }
    if (query.length > 1000) {
      throw new Error('Query too long. Maximum 1000 characters');
    }
    const queries = database.getQueries();
    const results = queries.searchResources.all(query);
    return { success: true, data: results };
  } catch (error) {
    console.error('[DB] Error searching resources:', error);
    
    // Try to handle corruption errors
    const handled = database.handleCorruptionError(error);
    if (handled) {
      // Retry the operation after repair
      // Queries are automatically invalidated by handleCorruptionError
      try {
        const queries = database.getQueries();
        const results = queries.searchResources.all(query);
        return { success: true, data: results };
      } catch (retryError) {
        console.error('[DB] Error retrying search after repair:', retryError);
        // If it's still corrupt, try one more repair cycle
        if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
          console.warn('[DB] Corruption persists in search, attempting more aggressive repair...');
          database.invalidateQueries();
          const repairedAgain = database.repairFTSTables();
          if (repairedAgain) {
            try {
              const queries = database.getQueries();
              const results = queries.searchResources.all(query);
              return { success: true, data: results };
            } catch (finalError) {
              console.error('[DB] Error after second repair attempt:', finalError);
              return { success: false, error: finalError.message };
            }
          }
        }
        return { success: false, error: retryError.message };
      }
    }
    
    return { success: false, error: error.message };
  }
});

// Search for mentions (quick autocomplete)
ipcMain.handle('db:resources:searchForMention', (event, query) => {
  try {
    validateSender(event, windowManager);
    // Validar query
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }
    if (query.length > 200) {
      throw new Error('Query too long. Maximum 200 characters');
    }
    const queries = database.getQueries();
    const searchTerm = `%${query}%`;
    const results = queries.searchForMention.all(searchTerm, searchTerm);
    return { success: true, data: results };
  } catch (error) {
    console.error('[DB] Error searching for mentions:', error);
    return { success: false, error: error.message };
  }
});

// Get backlinks (resources that link to this resource)
ipcMain.handle('db:resources:getBacklinks', (event, resourceId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const results = queries.getBacklinks.all(resourceId);
    return { success: true, data: results };
  } catch (error) {
    console.error('[DB] Error getting backlinks:', error);
    return { success: false, error: error.message };
  }
});

// Upload file and create resource (wrapper for resource:import)
ipcMain.handle('db:resources:uploadFile', async (event, { filePath, projectId, type, title }) => {
  // This is just a convenience wrapper - the actual implementation
  // is in resource:import handler. We'll call it directly.
  // Note: We can't directly call another handler, so we'll duplicate the logic
  // or use a shared function. For now, we'll just redirect to resource:import
  // The client should call resource:import instead, but we keep this for API consistency
  try {
    validateSender(event, windowManager);
    // Import the resource using the existing handler
    // Since we can't call handlers from handlers, we'll need to extract the logic
    // For now, return an error suggesting to use resource:import
    return { 
      success: false, 
      error: 'Use resource:import instead',
      suggestion: 'Use window.electron.resource.import() instead'
    };
  } catch (error) {
    console.error('[DB] Error uploading file:', error);
    return { success: false, error: error.message };
  }
});

// Settings
ipcMain.handle('db:settings:get', (event, key) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const result = queries.getSetting.get(key);
    return { success: true, data: result ? result.value : null };
  } catch (error) {
    console.error('[DB] Error getting setting:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:settings:set', (event, key, value) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    
    // Debug: log value details for email to diagnose truncation issue
    if (key === 'user_email') {
      console.log(`[DB] Setting user_email:`);
      console.log(`[DB]   - Raw value: "${value}"`);
      console.log(`[DB]   - Length: ${value?.length}`);
      console.log(`[DB]   - Type: ${typeof value}`);
      console.log(`[DB]   - Char codes: ${value?.split('').map(c => c.charCodeAt(0)).join(',')}`);
    } else {
      console.log(`[DB] Setting ${key} = ${value} (type: ${typeof value})`);
    }
    
    queries.setSetting.run(key, value, Date.now());
    
    // Verify it was saved
    const saved = queries.getSetting.get(key);
    if (key === 'user_email') {
      console.log(`[DB] Verified saved user_email:`);
      console.log(`[DB]   - Saved value: "${saved?.value}"`);
      console.log(`[DB]   - Saved length: ${saved?.value?.length}`);
    } else {
      console.log(`[DB] Verified saved ${key} = ${saved?.value}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[DB] Error setting setting:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// RESOURCE INTERACTIONS IPC HANDLERS
// ============================================

// Create interaction (note, annotation, chat)
ipcMain.handle('db:interactions:create', (event, interaction) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.createInteraction.run(
      interaction.id,
      interaction.resource_id,
      interaction.type,
      interaction.content,
      interaction.position_data ? JSON.stringify(interaction.position_data) : null,
      interaction.metadata ? JSON.stringify(interaction.metadata) : null,
      interaction.created_at,
      interaction.updated_at
    );

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('interaction:created', interaction);

    return { success: true, data: interaction };
  } catch (error) {
    console.error('[DB] Error creating interaction:', error);
    return { success: false, error: error.message };
  }
});

// Get interactions by resource
ipcMain.handle('db:interactions:getByResource', (event, resourceId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const interactions = queries.getInteractionsByResource.all(resourceId);
    return { success: true, data: interactions };
  } catch (error) {
    console.error('[DB] Error getting interactions:', error);
    return { success: false, error: error.message };
  }
});

// Get interactions by type
ipcMain.handle('db:interactions:getByType', (event, { resourceId, type }) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const interactions = queries.getInteractionsByType.all(resourceId, type);
    return { success: true, data: interactions };
  } catch (error) {
    console.error('[DB] Error getting interactions by type:', error);
    return { success: false, error: error.message };
  }
});

// Update interaction
ipcMain.handle('db:interactions:update', (event, interaction) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.updateInteraction.run(
      interaction.content,
      interaction.position_data ? JSON.stringify(interaction.position_data) : null,
      interaction.metadata ? JSON.stringify(interaction.metadata) : null,
      interaction.updated_at,
      interaction.id
    );

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('interaction:updated', {
      id: interaction.id,
      updates: interaction
    });

    return { success: true, data: interaction };
  } catch (error) {
    console.error('[DB] Error updating interaction:', error);
    return { success: false, error: error.message };
  }
});

// Delete interaction
ipcMain.handle('db:interactions:delete', (event, id) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.deleteInteraction.run(id);

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('interaction:deleted', { id });

    return { success: true };
  } catch (error) {
    console.error('[DB] Error deleting interaction:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// RESOURCE LINKS IPC HANDLERS
// ============================================

// Create link
ipcMain.handle('db:links:create', (event, link) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.createLink.run(
      link.id,
      link.source_id,
      link.target_id,
      link.link_type,
      link.weight || 1.0,
      link.metadata ? JSON.stringify(link.metadata) : null,
      link.created_at
    );
    return { success: true, data: link };
  } catch (error) {
    console.error('[DB] Error creating link:', error);
    return { success: false, error: error.message };
  }
});

// Get links by source
ipcMain.handle('db:links:getBySource', (event, sourceId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const links = queries.getLinksBySource.all(sourceId);
    return { success: true, data: links };
  } catch (error) {
    console.error('[DB] Error getting links by source:', error);
    return { success: false, error: error.message };
  }
});

// Get links by target
ipcMain.handle('db:links:getByTarget', (event, targetId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const links = queries.getLinksByTarget.all(targetId);
    return { success: true, data: links };
  } catch (error) {
    console.error('[DB] Error getting links by target:', error);
    return { success: false, error: error.message };
  }
});

// Delete link
ipcMain.handle('db:links:delete', (event, id) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    queries.deleteLink.run(id);
    return { success: true };
  } catch (error) {
    console.error('[DB] Error deleting link:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// UNIFIED SEARCH IPC HANDLERS
// ============================================

// Search across resources and interactions
ipcMain.handle('db:search:unified', (event, query) => {
  try {
    validateSender(event, windowManager);
    // Validar query
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }
    if (query.length > 1000) {
      throw new Error('Query too long. Maximum 1000 characters');
    }
    const queries = database.getQueries();

    // Search resources
    const resourceResults = queries.searchResources.all(query);

    // Search interactions
    const interactionResults = queries.searchInteractions.all(query);

    // Enrich resources: add parent resources for interactions that matched
    // but whose resource did not match in FTS (e.g. match only in annotation)
    const resourceIds = new Set(resourceResults.map((r) => r.id));
    for (const interaction of interactionResults) {
      const rid = interaction.resource_id;
      if (rid && !resourceIds.has(rid)) {
        const resource = queries.getResourceById.get(rid);
        if (resource) {
          resourceResults.push(resource);
          resourceIds.add(rid);
        }
      }
    }

    return {
      success: true,
      data: {
        resources: resourceResults,
        interactions: interactionResults,
      },
    };
  } catch (error) {
    console.error('[DB] Error in unified search:', error);
    
    // Try to handle corruption errors
    const handled = database.handleCorruptionError(error);
    if (handled) {
      // Retry the operation after repair
      // Queries are automatically invalidated by handleCorruptionError
      try {
        const queries = database.getQueries();
        const resourceResults = queries.searchResources.all(query);
        const interactionResults = queries.searchInteractions.all(query);
        
        const resourceIds = new Set(resourceResults.map((r) => r.id));
        for (const interaction of interactionResults) {
          const rid = interaction.resource_id;
          if (rid && !resourceIds.has(rid)) {
            const resource = queries.getResourceById.get(rid);
            if (resource) {
              resourceResults.push(resource);
              resourceIds.add(rid);
            }
          }
        }
        
        return {
          success: true,
          data: {
            resources: resourceResults,
            interactions: interactionResults,
          },
        };
      } catch (retryError) {
        console.error('[DB] Error retrying unified search after repair:', retryError);
        // If it's still corrupt, try one more repair cycle
        if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
          console.warn('[DB] Corruption persists in unified search, attempting more aggressive repair...');
          database.invalidateQueries();
          const repairedAgain = database.repairFTSTables();
          if (repairedAgain) {
            try {
              const queries = database.getQueries();
              const resourceResults = queries.searchResources.all(query);
              const interactionResults = queries.searchInteractions.all(query);
              
              const resourceIds = new Set(resourceResults.map((r) => r.id));
              for (const interaction of interactionResults) {
                const rid = interaction.resource_id;
                if (rid && !resourceIds.has(rid)) {
                  const resource = queries.getResourceById.get(rid);
                  if (resource) {
                    resourceResults.push(resource);
                    resourceIds.add(rid);
                  }
                }
              }
              
              return {
                success: true,
                data: {
                  resources: resourceResults,
                  interactions: interactionResults,
                },
              };
            } catch (finalError) {
              console.error('[DB] Error after second repair attempt:', finalError);
              return { success: false, error: finalError.message };
            }
          }
        }
        return { success: false, error: retryError.message };
      }
    }
    
    return { success: false, error: error.message };
  }
});

// Get all resources (for Command Center)
ipcMain.handle('db:resources:getAll', (event, limit = 100) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const resources = queries.getAllResources.all(limit);
    return { success: true, data: resources };
  } catch (error) {
    console.error('[DB] Error getting all resources:', error);
    return { success: false, error: error.message };
  }
});

// Delete resource
ipcMain.handle('db:resources:delete', (event, id) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    // Get resource to find internal_path
    const resource = queries.getResourceById.get(id);
    if (resource && resource.internal_path) {
      // Delete the internal file
      fileStorage.deleteFile(resource.internal_path);
    }
    // Delete from database
    queries.deleteResource.run(id);

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('resource:deleted', { id });

    return { success: true };
  } catch (error) {
    console.error('[DB] Error deleting resource:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// FOLDER CONTAINMENT IPC HANDLERS
// ============================================

// Get resources in a folder
ipcMain.handle('db:resources:getByFolder', (event, folderId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const resources = queries.getResourcesByFolder.all(folderId);
    return { success: true, data: resources };
  } catch (error) {
    console.error('[DB] Error getting resources by folder:', error);
    return { success: false, error: error.message };
  }
});

// Get root resources (not in any folder)
ipcMain.handle('db:resources:getRoot', (event, projectId = 'default') => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const resources = queries.getRootResources.all(projectId);
    return { success: true, data: resources };
  } catch (error) {
    console.error('[DB] Error getting root resources:', error);
    return { success: false, error: error.message };
  }
});

// Move resource to a folder
ipcMain.handle('db:resources:moveToFolder', (event, { resourceId, folderId }) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();

    // Verify the folder exists and is actually a folder
    if (folderId) {
      const folder = queries.getResourceById.get(folderId);
      if (!folder) {
        return { success: false, error: 'Folder not found' };
      }
      if (folder.type !== 'folder') {
        return { success: false, error: 'Target is not a folder' };
      }
      // Prevent moving folder into itself
      if (resourceId === folderId) {
        return { success: false, error: 'Cannot move folder into itself' };
      }
    }

    queries.moveResourceToFolder.run(folderId || null, Date.now(), resourceId);

    // Broadcast evento a todas las ventanas
    windowManager.broadcast('resource:updated', {
      id: resourceId,
      updates: { folder_id: folderId, updated_at: Date.now() }
    });

    return { success: true };
  } catch (error) {
    console.error('[DB] Error moving resource to folder:', error);
    return { success: false, error: error.message };
  }
});

// Remove resource from folder (move to root)
ipcMain.handle('db:resources:removeFromFolder', (event, resourceId) => {
  try {
    validateSender(event, windowManager);
    const queries = database.getQueries();
    const now = Date.now();
    queries.removeResourceFromFolder.run(now, resourceId);

    // Broadcast so Home and other windows update immediately
    windowManager.broadcast('resource:updated', {
      id: resourceId,
      updates: { folder_id: null, updated_at: now },
    });

    return { success: true };
  } catch (error) {
    console.error('[DB] Error removing resource from folder:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// RESOURCE FILE STORAGE IPC HANDLERS
// ============================================

/**
 * Generate a unique ID for resources
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Import a file: copy to internal storage and create resource
 */
ipcMain.handle('resource:import', async (event, { filePath, projectId, type, title }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // Import file to internal storage
    const importResult = await fileStorage.importFile(filePath, type);

    // Check for duplicate by hash
    const queries = database.getQueries();
    const existingResource = queries.findByHash.get(importResult.hash);
    if (existingResource) {
      return {
        success: false,
        error: 'duplicate',
        duplicate: {
          id: existingResource.id,
          title: existingResource.title,
          projectId: existingResource.project_id,
        },
      };
    }

    // Generate thumbnail for supported types
    const fullPath = fileStorage.getFullPath(importResult.internalPath);
    const thumbnailData = await thumbnail.generateThumbnail(
      fullPath,
      type,
      importResult.mimeType
    );

    // Extract text content for document types (for card preview)
    let contentText = null;
    if (type === 'document') {
      try {
        contentText = await documentExtractor.extractDocumentText(fullPath, importResult.mimeType);
      } catch (extractError) {
        console.warn('[Resource] Text extraction failed, continuing without content:', extractError.message);
      }
    }

    // Create resource in database
    const resourceId = generateId();
    const now = Date.now();
    const resourceTitle = title || importResult.originalName || 'Untitled';

    queries.createResourceWithFile.run(
      resourceId,
      projectId,
      type,
      resourceTitle,
      contentText, // content - extracted text for documents
      null, // file_path (legacy, not used)
      importResult.internalPath,
      importResult.mimeType,
      importResult.size,
      importResult.hash,
      thumbnailData,
      importResult.originalName,
      null, // metadata
      now,
      now
    );

    // Get the created resource
    const resource = queries.getResourceById.get(resourceId);

    // Broadcast so Home and other windows update immediately
    windowManager.broadcast('resource:created', resource);

    console.log(`[Resource] Imported: ${resourceTitle} (${importResult.internalPath})`);

    return {
      success: true,
      data: resource,
      thumbnailDataUrl: thumbnailData,
    };
  } catch (error) {
    console.error('[Resource] Error importing file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Import multiple files at once
 */
ipcMain.handle('resource:importMultiple', async (event, { filePaths, projectId, type }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const results = [];
  const errors = [];

  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) {
        errors.push({ filePath, error: 'File not found' });
        continue;
      }

      // Determine type from extension if not provided
      const ext = path.extname(filePath).toLowerCase();
      let fileType = type;
      if (!fileType) {
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
          fileType = 'image';
        } else if (ext === '.pdf') {
          fileType = 'pdf';
        } else if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
          fileType = 'video';
        } else if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext)) {
          fileType = 'audio';
        } else {
          fileType = 'document';
        }
      }

      const importResult = await fileStorage.importFile(filePath, fileType);

      // Check for duplicate
      const queries = database.getQueries();
      const existingResource = queries.findByHash.get(importResult.hash);
      if (existingResource) {
        errors.push({
          filePath,
          error: 'duplicate',
          duplicate: existingResource,
        });
        continue;
      }

      // Generate thumbnail
      const fullPath = fileStorage.getFullPath(importResult.internalPath);
      const thumbnailData = await thumbnail.generateThumbnail(
        fullPath,
        fileType,
        importResult.mimeType
      );

      // Create resource
      const resourceId = generateId();
      const now = Date.now();

      queries.createResourceWithFile.run(
        resourceId,
        projectId,
        fileType,
        importResult.originalName,
        null,
        null,
        importResult.internalPath,
        importResult.mimeType,
        importResult.size,
        importResult.hash,
        thumbnailData,
        importResult.originalName,
        null,
        now,
        now
      );

      const resource = queries.getResourceById.get(resourceId);

      // Broadcast so Home and other windows update immediately
      windowManager.broadcast('resource:created', resource);

      results.push({ success: true, data: resource });
    } catch (error) {
      errors.push({ filePath, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    data: results,
    errors: errors.length > 0 ? errors : undefined,
  };
});

/**
 * Get full path for a resource (to open in native app)
 */
ipcMain.handle('resource:getFilePath', (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Prefer internal_path, fallback to legacy file_path
    if (resource.internal_path) {
      const fullPath = fileStorage.getFullPath(resource.internal_path);
      if (fileStorage.fileExists(resource.internal_path)) {
        return { success: true, data: fullPath };
      }
      return { success: false, error: 'Internal file not found' };
    }

    // Legacy: use file_path
    if (resource.file_path && fs.existsSync(resource.file_path)) {
      return { success: true, data: resource.file_path };
    }

    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('[Resource] Error getting file path:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Read file content as Base64 data URL
 */
ipcMain.handle('resource:readFile', (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Prefer internal_path
    if (resource.internal_path) {
      const dataUrl = fileStorage.readFileAsDataUrl(resource.internal_path);
      if (dataUrl) {
        return { success: true, data: dataUrl };
      }
      return { success: false, error: 'Internal file not found' };
    }

    // Legacy: read from file_path
    if (resource.file_path && fs.existsSync(resource.file_path)) {
      const buffer = fs.readFileSync(resource.file_path);
      const ext = path.extname(resource.file_path).toLowerCase();
      const mimeType = fileStorage.getMimeType(ext);
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      return { success: true, data: dataUrl };
    }

    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('[Resource] Error reading file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Read document content as base64 for renderer-side parsing (DOCX, XLSX, CSV)
 */
ipcMain.handle('resource:readDocumentContent', (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    if (!resource.internal_path) {
      return { success: false, error: 'No internal file path' };
    }

    const fullPath = fileStorage.getFullPath(resource.internal_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'File not found on disk' };
    }

    const buffer = fs.readFileSync(fullPath);
    const base64 = buffer.toString('base64');

    return {
      success: true,
      data: base64,
      mimeType: resource.file_mime_type,
      filename: resource.original_filename || resource.title,
    };
  } catch (error) {
    console.error('[Resource] Error reading document content:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Export resource to user-selected location
 */
ipcMain.handle('resource:export', async (event, { resourceId, destinationPath }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Determine source path
    let sourcePath = null;
    if (resource.internal_path) {
      sourcePath = fileStorage.getFullPath(resource.internal_path);
    } else if (resource.file_path) {
      sourcePath = resource.file_path;
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source file not found' };
    }

    // Ensure destination directory exists
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy file
    fs.copyFileSync(sourcePath, destinationPath);

    console.log(`[Resource] Exported: ${resource.title} -> ${destinationPath}`);

    return { success: true, data: destinationPath };
  } catch (error) {
    console.error('[Resource] Error exporting file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Delete resource and its internal file
 */
ipcMain.handle('resource:delete', (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Delete internal file if exists
    if (resource.internal_path) {
      fileStorage.deleteFile(resource.internal_path);
    }

    // Delete from database
    queries.deleteResource.run(resourceId);

    // Broadcast so Home and other windows update immediately
    windowManager.broadcast('resource:deleted', { id: resourceId });

    console.log(`[Resource] Deleted: ${resource.title}`);

    return { success: true };
  } catch (error) {
    console.error('[Resource] Error deleting resource:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Regenerate thumbnail for a resource
 */
ipcMain.handle('resource:regenerateThumbnail', async (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    if (!resource.internal_path) {
      return { success: false, error: 'Resource has no internal file' };
    }

    const fullPath = fileStorage.getFullPath(resource.internal_path);
    const thumbnailData = await thumbnail.generateThumbnail(
      fullPath,
      resource.type,
      resource.file_mime_type
    );

    if (thumbnailData) {
      queries.updateResourceThumbnail.run(thumbnailData, Date.now(), resourceId);
      return { success: true, data: thumbnailData };
    }

    return { success: false, error: 'Failed to generate thumbnail' };
  } catch (error) {
    console.error('[Resource] Error regenerating thumbnail:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// STORAGE MANAGEMENT IPC HANDLERS
// ============================================

/**
 * Get storage usage statistics
 */
ipcMain.handle('storage:getUsage', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const usage = fileStorage.getStorageUsage();
    return { success: true, data: usage };
  } catch (error) {
    console.error('[Storage] Error getting usage:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Clean up orphaned files (files not referenced in database)
 */
ipcMain.handle('storage:cleanup', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const internalPaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);
    const result = fileStorage.cleanupOrphanedFiles(internalPaths);

    console.log(`[Storage] Cleanup: deleted ${result.deleted} orphaned files, freed ${result.freedBytes} bytes`);

    return { success: true, data: result };
  } catch (error) {
    console.error('[Storage] Error during cleanup:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get storage directory path
 */
ipcMain.handle('storage:getPath', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  return { success: true, data: fileStorage.getStorageDir() };
});

// ============================================
// MIGRATION IPC HANDLERS
// ============================================

/**
 * Migrate legacy resources (file_path -> internal_path)
 */
ipcMain.handle('migration:migrateResources', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const legacyResources = queries.getResourcesWithLegacyPath.all();

    if (legacyResources.length === 0) {
      return { success: true, data: { migrated: 0, failed: 0 } };
    }

    console.log(`[Migration] Found ${legacyResources.length} resources to migrate`);

    let migrated = 0;
    let failed = 0;
    const errors = [];

    for (const resource of legacyResources) {
      try {
        // Check if original file exists
        if (!fs.existsSync(resource.file_path)) {
          console.warn(`[Migration] File not found for ${resource.id}: ${resource.file_path}`);
          errors.push({ id: resource.id, error: 'File not found' });
          failed++;
          continue;
        }

        // Import to internal storage
        const importResult = await fileStorage.importFile(resource.file_path, resource.type);

        // Generate thumbnail
        const fullPath = fileStorage.getFullPath(importResult.internalPath);
        const thumbnailData = await thumbnail.generateThumbnail(
          fullPath,
          resource.type,
          importResult.mimeType
        );

        // Update resource
        queries.updateResourceFile.run(
          importResult.internalPath,
          importResult.mimeType,
          importResult.size,
          importResult.hash,
          thumbnailData,
          importResult.originalName,
          Date.now(),
          resource.id
        );

        console.log(`[Migration] Migrated: ${resource.title}`);
        migrated++;
      } catch (error) {
        console.error(`[Migration] Failed to migrate ${resource.id}:`, error);
        errors.push({ id: resource.id, error: error.message });
        failed++;
      }
    }

    return {
      success: true,
      data: {
        migrated,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error) {
    console.error('[Migration] Error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get migration status
 */
ipcMain.handle('migration:getStatus', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const legacyResources = queries.getResourcesWithLegacyPath.all();

    return {
      success: true,
      data: {
        pendingMigrations: legacyResources.length,
        resources: legacyResources.map((r) => ({
          id: r.id,
          title: r.title,
          file_path: r.file_path,
        })),
      },
    };
  } catch (error) {
    console.error('[Migration] Error getting status:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// WEB SCRAPING IPC HANDLERS
// ============================================

/**
 * Scrape a URL and extract content + screenshot
 */
ipcMain.handle('web:scrape', async (event, url) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await webScraper.scrapeUrl(url);
    return result;
  } catch (error) {
    console.error('[Web] Error scraping URL:', error);
    return { success: false, error: error.message, url };
  }
});

/**
 * Get YouTube thumbnail
 */
ipcMain.handle('web:get-youtube-thumbnail', async (event, url) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await youtubeService.getYouTubeThumbnail(url);
    return result;
  } catch (error) {
    console.error('[Web] Error getting YouTube thumbnail:', error);
    return { success: false, error: error.message, url };
  }
});

/**
 * Save screenshot to internal storage and update resource thumbnail
 */
ipcMain.handle('web:save-screenshot', async (event, { resourceId, screenshotBase64, internalPath }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // If internalPath is provided, use it; otherwise save from base64
    let finalInternalPath = internalPath;
    let thumbnailData = screenshotBase64;

    if (!internalPath && screenshotBase64) {
      // Save screenshot to internal storage
      const buffer = Buffer.from(screenshotBase64, 'base64');
      const saved = await fileStorage.importFromBuffer(buffer, `screenshot_${resourceId}.png`, 'url');
      finalInternalPath = saved.internalPath;

      // Generate thumbnail data URL
      thumbnailData = fileStorage.readFileAsDataUrl(saved.internalPath);
    }

    // Update resource with thumbnail
    if (thumbnailData) {
      queries.updateResourceThumbnail.run(thumbnailData, Date.now(), resourceId);

      // Update internal_path if needed
      if (finalInternalPath && !resource.internal_path) {
        queries.updateResourceFile.run(
          finalInternalPath,
          'image/png',
          Buffer.from(screenshotBase64 || '', 'base64').length,
          null,
          thumbnailData,
          null,
          Date.now(),
          resourceId
        );
      }
    }

    return { success: true, thumbnailData, internalPath: finalInternalPath };
  } catch (error) {
    console.error('[Web] Error saving screenshot:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Process URL resource completely (scrape + screenshot + embeddings + summary)
 */
ipcMain.handle('web:process', async (event, resourceId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    if (resource.type !== 'url') {
      return { success: false, error: 'Resource is not a URL type' };
    }

    const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
    const url = metadata.url || resource.content;

    if (!url) {
      return { success: false, error: 'URL not found in resource' };
    }

    // Update processing status
    metadata.processing_status = 'processing';
    queries.updateResource.run(
      resource.title,
      resource.content,
      JSON.stringify(metadata),
      Date.now(),
      resourceId
    );

    // Check if it's YouTube
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    let thumbnailResult = null;
    let scrapeResult = null;

    if (isYouTube) {
      // Get YouTube thumbnail
      thumbnailResult = await youtubeService.getYouTubeThumbnail(url);

      if (thumbnailResult.success && thumbnailResult.thumbnail) {
        // Save thumbnail
        const screenshotBuffer = Buffer.from(thumbnailResult.thumbnail.dataUrl.split(',')[1], 'base64');
        const saved = await fileStorage.importFromBuffer(
          screenshotBuffer,
          `youtube_${thumbnailResult.videoId}.jpg`,
          'url'
        );

        queries.updateResourceThumbnail.run(
          thumbnailResult.thumbnail.dataUrl,
          Date.now(),
          resourceId
        );

        metadata.video_id = thumbnailResult.videoId;
        metadata.screenshot_path = saved.internalPath;
      }
    } else {
      // Scrape article
      scrapeResult = await webScraper.scrapeUrl(url);

      if (scrapeResult.success) {
        // Save screenshot if available
        if (scrapeResult.screenshot) {
          const screenshotBuffer = Buffer.from(scrapeResult.screenshot, 'base64');
          const saved = await fileStorage.importFromBuffer(
            screenshotBuffer,
            `screenshot_${resourceId}.png`,
            'url'
          );

          const dataUrl = `data:image/png;base64,${scrapeResult.screenshot}`;
          queries.updateResourceThumbnail.run(dataUrl, Date.now(), resourceId);

          metadata.screenshot_path = saved.internalPath;
        }

        // Update title and content
        if (scrapeResult.title) {
          queries.updateResource.run(
            scrapeResult.title,
            resource.content,
            JSON.stringify(metadata),
            Date.now(),
            resourceId
          );
        }

        metadata.scraped_content = scrapeResult.content;
        metadata.metadata = scrapeResult.metadata;
      }
    }

    // Generate embedding and summary if Ollama is available
    const contentToProcess = scrapeResult?.content || '';

    if (contentToProcess.length > 0) {
      try {
        const isOllamaAvailable = await ollamaService.checkAvailability();

        if (isOllamaAvailable) {
          // Get Ollama config
          const queries = database.getQueries();
          const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
          const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
          const ollamaModel = queries.getSetting.get('ollama_model');

          const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
          const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
          const model = ollamaModel?.value || ollamaService.DEFAULT_MODEL;

          // Generate embedding
          try {
            const embedding = await ollamaService.generateEmbedding(contentToProcess, embeddingModel, baseUrl);
            metadata.embedding = embedding;
          } catch (error) {
            console.error('[Web] Error generating embedding:', error);
          }

          // Generate summary
          try {
            const summary = await ollamaService.generateSummary(contentToProcess, model, baseUrl);
            metadata.summary = summary;
          } catch (error) {
            console.error('[Web] Error generating summary:', error);
          }
        }
      } catch (error) {
        console.error('[Web] Error processing with Ollama:', error);
      }
    }

    // Update final status
    metadata.processing_status = 'completed';
    metadata.processed_at = Date.now();

    queries.updateResource.run(
      resource.title,
      resource.content,
      JSON.stringify(metadata),
      Date.now(),
      resourceId
    );

    return { success: true, metadata };
  } catch (error) {
    console.error('[Web] Error processing URL resource:', error);

    // Update status to failed
    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (resource) {
        const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
        metadata.processing_status = 'failed';
        queries.updateResource.run(
          resource.title,
          resource.content,
          JSON.stringify(metadata),
          Date.now(),
          resourceId
        );
      }
    } catch (updateError) {
      console.error('[Web] Error updating failed status:', updateError);
    }

    return { success: false, error: error.message };
  }
});

// ============================================
// OLLAMA IPC HANDLERS
// ============================================

/**
 * Check if Ollama is available
 */
ipcMain.handle('ollama:check-availability', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
    const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
    const isAvailable = await ollamaService.checkAvailability(baseUrl);
    return { success: true, available: isAvailable };
  } catch (error) {
    console.error('[Ollama] Error checking availability:', error);
    return { success: false, error: error.message, available: false };
  }
});

/**
 * List available models from Ollama
 */
ipcMain.handle('ollama:list-models', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
    const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
    const models = await ollamaService.listModels(baseUrl);
    return { success: true, models };
  } catch (error) {
    console.error('[Ollama] Error listing models:', error);
    return { success: false, error: error.message, models: [] };
  }
});

/**
 * Generate embedding with Ollama
 */
ipcMain.handle('ollama:generate-embedding', async (event, text) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar text
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }
    if (text.length === 0) {
      throw new Error('Text cannot be empty');
    }
    if (text.length > 100000) {
      throw new Error('Text too long. Maximum 100000 characters');
    }
    const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
    const embeddingModelResult = database.getQueries().getSetting.get('ollama_embedding_model');

    const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
    const model = embeddingModelResult?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;

    const embedding = await ollamaService.generateEmbedding(text, model, baseUrl);
    return { success: true, embedding };
  } catch (error) {
    console.error('[Ollama] Error generating embedding:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Generate summary with Ollama
 */
ipcMain.handle('ollama:generate-summary', async (event, text) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar text
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }
    if (text.length === 0) {
      throw new Error('Text cannot be empty');
    }
    if (text.length > 500000) {
      throw new Error('Text too long. Maximum 500000 characters');
    }
    const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
    const modelResult = database.getQueries().getSetting.get('ollama_model');

    const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
    const model = modelResult?.value || ollamaService.DEFAULT_MODEL;

    const summary = await ollamaService.generateSummary(text, model, baseUrl);
    return { success: true, summary };
  } catch (error) {
    console.error('[Ollama] Error generating summary:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Chat with Ollama
 */
ipcMain.handle('ollama:chat', async (event, { messages, model }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar messages
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }
    if (messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }
    if (messages.length > 100) {
      throw new Error('Too many messages. Maximum 100 messages');
    }
    // Validar estructura de cada mensaje
    for (const msg of messages) {
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        throw new Error('Each message must be an object');
      }
      if (typeof msg.role !== 'string' || !['system', 'user', 'assistant'].includes(msg.role)) {
        throw new Error('Message role must be "system", "user", or "assistant"');
      }
      if (typeof msg.content !== 'string') {
        throw new Error('Message content must be a string');
      }
      if (msg.content.length > 100000) {
        throw new Error('Message content too long. Maximum 100000 characters per message');
      }
    }
    // Validar model si se proporciona
    if (model !== undefined && (typeof model !== 'string' || model.length > 200)) {
      throw new Error('Model must be a string with max 200 characters');
    }
    const queries = database.getQueries();
    const baseUrlResult = queries.getSetting.get('ollama_base_url');
    const modelResult = queries.getSetting.get('ollama_model');

    const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
    const chatModel = model || modelResult?.value || ollamaService.DEFAULT_MODEL;

    console.log(`[Ollama] Chat config - Base URL: ${baseUrl}, Model from param: ${model}, Model from DB: ${modelResult?.value}, Using: ${chatModel}`);

    // Convertir mensajes del formato API al formato Ollama
    // Ollama espera mensajes sin el system prompt como mensaje separado
    const ollamaMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    const response = await ollamaService.chat(ollamaMessages, chatModel, baseUrl);

    return { success: true, content: response };
  } catch (error) {
    console.error('[Ollama] Error in chat:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// VECTOR DATABASE IPC HANDLERS - ANNOTATIONS
// ============================================

/**
 * Index annotation in LanceDB
 */
ipcMain.handle('vector:annotations:index', async (event, annotationData) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar annotationData
    if (!annotationData || typeof annotationData !== 'object' || Array.isArray(annotationData)) {
      throw new Error('AnnotationData must be an object');
    }
    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) {
      throw new Error('Vector database not initialized');
    }

    const {
      annotationId,
      resourceId,
      text,
      metadata,
    } = annotationData;

    // Validar campos requeridos
    if (!annotationId || typeof annotationId !== 'string' || annotationId.length > 200) {
      throw new Error('annotationId must be a non-empty string with max 200 characters');
    }
    if (!resourceId || typeof resourceId !== 'string' || resourceId.length > 200) {
      throw new Error('resourceId must be a non-empty string with max 200 characters');
    }
    if (typeof text !== 'string') {
      throw new Error('text must be a string');
    }
    if (text.length > 100000) {
      throw new Error('text too long. Maximum 100000 characters');
    }
    if (metadata !== undefined && (typeof metadata !== 'object' || Array.isArray(metadata))) {
      throw new Error('metadata must be an object');
    }

    // Generate embedding using Ollama or OpenAI
    let embedding = null;
    let embeddingDimension = 1024; // Default for Ollama bge-m3
    try {
      const queries = database.getQueries();
      const isOllamaAvailable = await ollamaService.checkAvailability();
      
      if (isOllamaAvailable) {
        const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
        const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
        const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
        const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
        
        embedding = await ollamaService.generateEmbedding(text, embeddingModel, baseUrl);
        if (embedding && Array.isArray(embedding)) {
          embeddingDimension = embedding.length;
        }
      } else {
        // TODO: Add OpenAI embedding support if needed
        console.warn('[Vector] Ollama not available, skipping embedding generation');
      }
    } catch (error) {
      console.error('[Vector] Error generating embedding:', error);
      // Continue without embedding - annotation will still be saved in SQLite
    }

    if (embedding) {
      // Get annotation embeddings table, create if needed with correct dimension
      let table;
      let tableCreated = false;
      try {
        table = await vectorDB.openTable('annotation_embeddings');
      } catch (error) {
        // Table might not exist, create it with correct dimension
        await initModule.createAnnotationEmbeddingsTable(embeddingDimension);
        table = await vectorDB.openTable('annotation_embeddings');
        tableCreated = true;
      }

      // Insert into LanceDB
      const embeddingData = {
        id: `${annotationId}-0`, // chunk_index is 0 for simple annotations
        resource_id: resourceId,
        annotation_id: annotationId,
        chunk_index: 0,
        text: text,
        vector: embedding,
        metadata: {
          ...metadata,
          created_at: Date.now(),
        },
      };

      try {
        await table.add([embeddingData]);
        console.log(`[Vector] Indexed annotation: ${annotationId}`);
      } catch (addError) {
        // If error is about schema/dimension mismatch, recreate table and retry
        const errorMessage = addError.message || '';
        const isSchemaError = errorMessage.includes('dictionary') || 
                             errorMessage.includes('Schema') ||
                             errorMessage.includes('schema') ||
                             errorMessage.includes('dimension');
        
        if (isSchemaError && !tableCreated) {
          console.log('[Vector] Schema/dimension mismatch detected, recreating table...');
          
          // Recreate table with correct dimension (forceRecreate = true)
          await initModule.createAnnotationEmbeddingsTable(embeddingDimension, true);
          table = await vectorDB.openTable('annotation_embeddings');
          
          // Retry insertion
          await table.add([embeddingData]);
          console.log(`[Vector] Indexed annotation: ${annotationId} (after table recreation)`);
        } else {
          // Re-throw if it's a different error or table was just created
          console.error('[Vector] Error adding annotation to table:', addError);
          throw addError;
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Vector] Error indexing annotation:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Search annotations in LanceDB
 */
ipcMain.handle('vector:annotations:search', async (event, queryData) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar queryData
    if (!queryData || typeof queryData !== 'object' || Array.isArray(queryData)) {
      throw new Error('QueryData must be an object');
    }
    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) {
      throw new Error('Vector database not initialized');
    }

    const { queryText, queryVector, limit = 10, resourceId } = queryData;

    // Validar campos
    if (queryText !== undefined && (typeof queryText !== 'string' || queryText.length > 1000)) {
      throw new Error('queryText must be a string with max 1000 characters');
    }
    if (queryVector !== undefined && (!Array.isArray(queryVector) || queryVector.length > 10000)) {
      throw new Error('queryVector must be an array with max 10000 elements');
    }
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('limit must be a number between 1 and 100');
    }
    if (resourceId !== undefined && (typeof resourceId !== 'string' || resourceId.length > 200)) {
      throw new Error('resourceId must be a string with max 200 characters');
    }

    // Generate query embedding if not provided
    let searchVector = queryVector;
    if (!searchVector && queryText) {
      try {
        const queries = database.getQueries();
        const isOllamaAvailable = await ollamaService.checkAvailability();
        
        if (isOllamaAvailable) {
          const ollamaBaseUrl = queries.getSetting.get('ollama_base_url');
          const ollamaEmbeddingModel = queries.getSetting.get('ollama_embedding_model');
          const baseUrl = ollamaBaseUrl?.value || ollamaService.DEFAULT_BASE_URL;
          const embeddingModel = ollamaEmbeddingModel?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
          
          searchVector = await ollamaService.generateEmbedding(queryText, embeddingModel, baseUrl);
        } else {
          throw new Error('Ollama not available for embedding generation');
        }
      } catch (error) {
        console.error('[Vector] Error generating query embedding:', error);
        return { success: false, error: error.message };
      }
    }

    if (!searchVector) {
      return { success: false, error: 'No query vector provided' };
    }

    // Open table and search
    const table = await vectorDB.openTable('annotation_embeddings');
    
    // Build filter if resourceId provided
    let filter = null;
    if (resourceId) {
      filter = `resource_id = "${resourceId}"`;
    }

    const results = await table.search(searchVector)
      .limit(limit)
      .where(filter)
      .execute();

    return {
      success: true,
      data: results.map((result) => ({
        annotationId: result.annotation_id,
        resourceId: result.resource_id,
        text: result.text,
        score: result._distance || 0,
        metadata: result.metadata,
      })),
    };
  } catch (error) {
    console.error('[Vector] Error searching annotations:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Delete annotation from LanceDB
 */
ipcMain.handle('vector:annotations:delete', async (event, annotationId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validar annotationId
    if (!annotationId || typeof annotationId !== 'string' || annotationId.length > 200) {
      throw new Error('annotationId must be a non-empty string with max 200 characters');
    }
    const vectorDB = initModule.getVectorDB();
    if (!vectorDB) {
      throw new Error('Vector database not initialized');
    }

    const table = await vectorDB.openTable('annotation_embeddings');
    await table.delete(`annotation_id = "${annotationId}"`);

    console.log(`[Vector] Deleted annotation: ${annotationId}`);
    return { success: true };
  } catch (error) {
    console.error('[Vector] Error deleting annotation:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// WHATSAPP IPC HANDLERS
// ============================================

// Lazy load WhatsApp service to avoid issues if Baileys is not installed
let whatsappService = null;
function getWhatsappService() {
  if (!whatsappService) {
    try {
      whatsappService = require('./whatsapp/service.cjs');
      whatsappService.init({
        database,
        fileStorage,
        windowManager,
        ollamaService,
      });
    } catch (error) {
      console.error('[WhatsApp] Failed to load service:', error.message);
      return null;
    }
  }
  return whatsappService;
}

ipcMain.handle('whatsapp:status', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return {
      success: true,
      data: {
        isRunning: false,
        state: 'disconnected',
        qrCode: null,
        selfId: null,
        hasAuth: false,
        error: 'WhatsApp service not available. Install @whiskeysockets/baileys',
      },
    };
  }

  return { success: true, data: service.getStatus() };
});

ipcMain.handle('whatsapp:start', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  return await service.start();
});

ipcMain.handle('whatsapp:stop', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  return await service.stop();
});

ipcMain.handle('whatsapp:logout', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  // Hacer logout y limpiar sesión (requiere nuevo QR)
  await service.logout();
  return service.clearSession();
});

ipcMain.handle('whatsapp:send', async (event, { phoneNumber, text }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  return await service.sendMessage(phoneNumber, text);
});

ipcMain.handle('whatsapp:allowlist:get', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: true, data: [] };
  }

  return { success: true, data: service.getAllowlist() };
});

ipcMain.handle('whatsapp:allowlist:add', (event, phoneNumber) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  service.addToAllowlist(phoneNumber);
  return { success: true };
});

ipcMain.handle('whatsapp:allowlist:remove', (event, phoneNumber) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const service = getWhatsappService();
  if (!service) {
    return { success: false, error: 'WhatsApp service not available' };
  }

  service.removeFromAllowlist(phoneNumber);
  return { success: true };
});

// ============================================
// AUTH MANAGER IPC HANDLERS
// ============================================

const authManager = require('./auth-manager.cjs');

ipcMain.handle('auth:profiles:list', (event, provider) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  return { success: true, data: authManager.listProfiles(provider) };
});

ipcMain.handle('auth:profiles:create', (event, params) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const profileId = authManager.createAuthProfile(params);
    return { success: true, data: { profileId } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:profiles:delete', (event, profileId) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    authManager.deleteAuthProfile(profileId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:resolve', (event, { provider, profileId }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const result = authManager.resolveApiKey({ provider, profileId });
  if (result) {
    // Don't return the actual API key to renderer, just metadata
    return {
      success: true,
      data: {
        source: result.source,
        mode: result.mode,
        profileId: result.profileId,
        hasKey: true,
      },
    };
  }
  return { success: true, data: { hasKey: false } };
});

ipcMain.handle('auth:validate', async (event, { provider, apiKey }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  return await authManager.validateApiKey(provider, apiKey);
});

// ============================================
// PERSONALITY LOADER IPC HANDLERS
// ============================================

const personalityLoader = require('./personality-loader.cjs');

ipcMain.handle('personality:get-prompt', (event, params) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const prompt = personalityLoader.buildSystemPrompt(params || {});
    return { success: true, data: prompt };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('personality:read-file', (event, filename) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  const content = personalityLoader.readContextFile(filename);
  return { success: true, data: content };
});

ipcMain.handle('personality:write-file', (event, { filename, content }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    personalityLoader.writeContextFile(filename, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('personality:add-memory', (event, entry) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    personalityLoader.addMemoryEntry(entry);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('personality:list-files', (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  return { success: true, data: personalityLoader.listContextFiles() };
});

// ============================================
// AI CLOUD IPC HANDLERS
// ============================================

const aiCloudService = require('./ai-cloud-service.cjs');

/**
 * Chat with cloud AI provider (OpenAI, Anthropic, Google)
 * This runs in main process to avoid CORS issues
 */
ipcMain.handle('ai:chat', async (event, { provider, messages, model }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    if (!provider || !['openai', 'anthropic', 'google'].includes(provider)) {
      throw new Error('Invalid provider. Must be openai, anthropic, or google');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }
    if (messages.length > 100) {
      throw new Error('Too many messages. Maximum 100');
    }

    // Get API key and auth mode from settings
    const queries = database.getQueries();
    let apiKey;
    let authType = 'api_key';
    let useProxy = false;

    // For Anthropic, check if using OAuth/Token authentication (subscription)
    if (provider === 'anthropic') {
      const authModeResult = queries.getSetting.get('ai_auth_mode');
      authType = authModeResult?.value || 'api_key';

      if (authType === 'oauth' || authType === 'token') {
        // Subscription mode - use claude-max-api-proxy
        useProxy = true;
        const proxyAvailable = await aiCloudService.checkClaudeMaxProxy();
        if (!proxyAvailable) {
          throw new Error(
            'Claude Max Proxy no está disponible. Para usar tu suscripción Claude Pro/Max:\n\n' +
            '1. Instala el proxy: npm install -g claude-max-api-proxy\n' +
            '2. Ejecuta: claude-max-api\n' +
            '3. El servidor estará en http://localhost:3456\n\n' +
            'Alternativamente, usa una API key de console.anthropic.com'
          );
        }
      } else {
        const apiKeyResult = queries.getSetting.get('ai_api_key');
        apiKey = apiKeyResult?.value;
        if (!apiKey) {
          throw new Error('API key not configured for Anthropic');
        }
      }
    } else {
      const apiKeyResult = queries.getSetting.get('ai_api_key');
      apiKey = apiKeyResult?.value;
      if (!apiKey) {
        throw new Error(`API key not configured for ${provider}`);
      }
    }

    // Get default model if not provided
    if (!model) {
      const modelResult = queries.getSetting.get('ai_model');
      model = modelResult?.value;
    }

    console.log(`[AI Cloud] Chat - Provider: ${provider}, Model: ${model}, AuthType: ${authType}, UseProxy: ${useProxy}`);
    
    let response;
    if (useProxy) {
      // Use claude-max-api-proxy for subscription
      response = await aiCloudService.chatAnthropicViaProxy(messages, model);
    } else {
      response = await aiCloudService.chat(provider, messages, apiKey, model);
    }
    
    return { success: true, content: response };
  } catch (error) {
    console.error('[AI Cloud] Chat error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Stream chat with cloud AI provider
 * Uses webContents.send to stream chunks back to renderer
 */
ipcMain.handle('ai:stream', async (event, { provider, messages, model, streamId }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    if (!provider || !['openai', 'anthropic', 'google'].includes(provider)) {
      throw new Error('Invalid provider. Must be openai, anthropic, or google');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }
    if (!streamId) {
      throw new Error('streamId is required for streaming');
    }

    // Get API key and auth mode from settings
    const queries = database.getQueries();
    let apiKey;
    let authType = 'api_key';
    let useProxy = false;

    // For Anthropic, check if using OAuth/Token authentication (subscription)
    if (provider === 'anthropic') {
      const authModeResult = queries.getSetting.get('ai_auth_mode');
      authType = authModeResult?.value || 'api_key';

      if (authType === 'oauth' || authType === 'token') {
        // Subscription mode - use claude-max-api-proxy
        useProxy = true;
        const proxyAvailable = await aiCloudService.checkClaudeMaxProxy();
        if (!proxyAvailable) {
          throw new Error(
            'Claude Max Proxy no está disponible. Para usar tu suscripción Claude Pro/Max:\n\n' +
            '1. Instala el proxy: npm install -g claude-max-api-proxy\n' +
            '2. Ejecuta: claude-max-api\n' +
            '3. El servidor estará en http://localhost:3456\n\n' +
            'Alternativamente, usa una API key de console.anthropic.com'
          );
        }
      } else {
        const apiKeyResult = queries.getSetting.get('ai_api_key');
        apiKey = apiKeyResult?.value;
        if (!apiKey) {
          throw new Error('API key not configured for Anthropic');
        }
      }
    } else {
      const apiKeyResult = queries.getSetting.get('ai_api_key');
      apiKey = apiKeyResult?.value;
      if (!apiKey) {
        throw new Error(`API key not configured for ${provider}`);
      }
    }

    // Get default model if not provided
    if (!model) {
      const modelResult = queries.getSetting.get('ai_model');
      model = modelResult?.value;
    }

    console.log(`[AI Cloud] Stream - Provider: ${provider}, Model: ${model}, StreamId: ${streamId}, AuthType: ${authType}, UseProxy: ${useProxy}`);

    // Stream chunks to renderer using fixed channel with streamId in payload
    const onChunk = (text) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'text', text });
      }
    };

    let fullResponse;
    if (useProxy) {
      // Use claude-max-api-proxy for subscription
      fullResponse = await aiCloudService.streamAnthropicViaProxy(messages, model, onChunk);
    } else {
      fullResponse = await aiCloudService.stream(provider, messages, apiKey, model, onChunk);
    }
    
    // Send done signal
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
    }

    return { success: true, content: fullResponse };
  } catch (error) {
    console.error('[AI Cloud] Stream error:', error);
    // Send error to stream
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: error.message });
    }
    return { success: false, error: error.message };
  }
});

/**
 * Generate embeddings with cloud AI provider
 */
ipcMain.handle('ai:embeddings', async (event, { provider, texts, model }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    if (!provider || !['openai', 'google'].includes(provider)) {
      throw new Error('Invalid provider for embeddings. Must be openai or google');
    }
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }
    if (texts.length > 100) {
      throw new Error('Too many texts. Maximum 100');
    }

    // Get API key from settings
    const queries = database.getQueries();
    const apiKeyResult = queries.getSetting.get('ai_api_key');
    const apiKey = apiKeyResult?.value;

    if (!apiKey) {
      throw new Error(`API key not configured for ${provider}`);
    }

    // Get default embedding model if not provided
    if (!model) {
      const modelResult = queries.getSetting.get('ai_embedding_model');
      model = modelResult?.value;
    }

    console.log(`[AI Cloud] Embeddings - Provider: ${provider}, Model: ${model}, Texts: ${texts.length}`);
    const embeddings = await aiCloudService.embeddings(provider, texts, apiKey, model);
    return { success: true, embeddings };
  } catch (error) {
    console.error('[AI Cloud] Embeddings error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Check if claude-max-api-proxy is available
 * Used to verify if Claude Pro/Max subscription can be used
 */
ipcMain.handle('ai:checkClaudeMaxProxy', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const available = await aiCloudService.checkClaudeMaxProxy();
    return { success: true, available };
  } catch (error) {
    console.error('[AI Cloud] Check proxy error:', error);
    return { success: false, error: error.message, available: false };
  }
});

// ============================================
// AI TOOLS HANDLERS
// ============================================

/**
 * Resource search using full-text search
 */
ipcMain.handle('ai:tools:resourceSearch', async (event, { query, options }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.resourceSearch(query, options || {});
  } catch (error) {
    console.error('[AI Tools] resourceSearch error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get resource by ID with full content
 */
ipcMain.handle('ai:tools:resourceGet', async (event, { resourceId, options }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.resourceGet(resourceId, options || {});
  } catch (error) {
    console.error('[AI Tools] resourceGet error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * List resources with optional filters
 */
ipcMain.handle('ai:tools:resourceList', async (event, { options }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.resourceList(options || {});
  } catch (error) {
    console.error('[AI Tools] resourceList error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Semantic search using embeddings
 */
ipcMain.handle('ai:tools:resourceSemanticSearch', async (event, { query, options }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.resourceSemanticSearch(query, options || {});
  } catch (error) {
    console.error('[AI Tools] resourceSemanticSearch error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * List all projects
 */
ipcMain.handle('ai:tools:projectList', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.projectList();
  } catch (error) {
    console.error('[AI Tools] projectList error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get project by ID
 */
ipcMain.handle('ai:tools:projectGet', async (event, { projectId }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.projectGet(projectId);
  } catch (error) {
    console.error('[AI Tools] projectGet error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * List interactions for a resource
 */
ipcMain.handle('ai:tools:interactionList', async (event, { resourceId, options }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    return await aiToolsHandler.interactionList(resourceId, options || {});
  } catch (error) {
    console.error('[AI Tools] interactionList error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get recent resources for context
 */
ipcMain.handle('ai:tools:getRecentResources', async (event, { limit }) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const resources = await aiToolsHandler.getRecentResources(limit || 5);
    return { success: true, resources };
  } catch (error) {
    console.error('[AI Tools] getRecentResources error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get current/default project
 */
ipcMain.handle('ai:tools:getCurrentProject', async (event) => {
  if (!windowManager.isAuthorized(event.sender.id)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const project = await aiToolsHandler.getCurrentProject();
    return { success: true, project };
  } catch (error) {
    console.error('[AI Tools] getCurrentProject error:', error);
    return { success: false, error: error.message };
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});
