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
const ollamaManager = require('./ollama-manager.cjs');
const aiToolsHandler = require('./ai-tools-handler.cjs');
const vectorHandler = require('./vector-handler.cjs');
const documentExtractor = require('./document-extractor.cjs');
const authManager = require('./auth-manager.cjs');
const personalityLoader = require('./personality-loader.cjs');
const aiCloudService = require('./ai-cloud-service.cjs');
const ttsService = require('./tts-service.cjs');
const { validateSender, sanitizePath, validateUrl } = require('./security.cjs');

// IPC handlers (modularized)
const { registerAll } = require('./ipc/index.cjs');

// Environment detection
const isDev = process.env.NODE_ENV === 'development' ||
  !app.isPackaged ||
  !fs.existsSync(path.join(__dirname, '../dist/index.html'));
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

  // Initialize Ollama Manager
  ollamaManager.initialize(mainWindow);
  console.log('[Main] Ollama Manager initialized');

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
    // This allows Vite build to work with absolute paths
    const outDir = path.join(__dirname, '../dist');
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
        // For SPA routing: if file doesn't exist and it's not a static asset,
        // fallback to index.html to let React Router handle it
        const isStaticAsset = /\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i.test(normalizedPath);

        if (!isStaticAsset) {
          const indexPath = path.join(outDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            fileCache.set(cacheKey, { exists: true, path: indexPath, timestamp: Date.now() });
            return net.fetch(pathToFileURL(indexPath).href);
          }
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

    // Register all IPC handlers (modularized in electron/ipc/)
    registerAll({
      app,
      windowManager,
      database,
      initModule,
      fileStorage,
      thumbnail,
      webScraper,
      youtubeService,
      ollamaService,
      ollamaManager,
      aiToolsHandler,
      aiCloudService,
      ttsService,
      vectorHandler,
      documentExtractor,
      authManager,
      personalityLoader,
      validateSender,
      sanitizePath,
      validateUrl,
    });

    // IMPORTANTE: Crear ventana PRIMERO para que la UI se muestre inmediatamente
    // La inicializacion de LanceDB puede fallar o bloquearse con modulos nativos
    createWindow();

    // Initialize the app in background (SQLite settings, LanceDB, filesystem)
    // No bloquea la UI - si falla, la app sigue funcionando sin busqueda vectorial
    initModule.initializeApp().catch(err => {
      console.error('❌ Background initialization failed:', err);
      console.warn('⚠️ Vector search will be disabled');
    });

    // Schedule orphan file cleanup after app is ready (non-blocking)
    setTimeout(() => {
      try {
        console.log('[App] Running automatic orphan file cleanup...');
        const queries = database.getQueries();
        const internalPaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);
        const avatarSetting = queries.getSetting.get('user_avatar_path');
        const currentAvatarPath = avatarSetting?.value || null;

        const result = fileStorage.cleanupOrphanedFiles(internalPaths, currentAvatarPath);

        if (result.deleted > 0) {
          console.log(`[App] Auto-cleanup: removed ${result.deleted} orphan files, freed ${(result.freedBytes / 1024 / 1024).toFixed(2)}MB`);
        } else {
          console.log('[App] Auto-cleanup: no orphan files found');
        }
      } catch (error) {
        console.error('[App] Auto-cleanup failed:', error);
      }
    }, 30000); // 30 seconds delay to let app stabilize
  })
  .catch(console.error);

// Cleanup before quit
app.on('before-quit', async () => {
  console.log('👋 Cerrando Dome...');
  await ollamaManager.cleanup();
  database.closeDB();
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});
