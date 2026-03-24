/* eslint-disable no-console */
// Increase default max listeners to avoid spurious warnings from concurrent
// fetch/stream AbortSignal usage (MCP servers, AI streams, etc.)
require('events').EventEmitter.defaultMaxListeners = 30;

// Load .env in development
const fs_env = require('fs');
const path_env = require('path');
const dotenvPath = path_env.join(__dirname, '../.env');
if (fs_env.existsSync(dotenvPath)) {
  const lines = fs_env.readFileSync(dotenvPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  Menu,
  Tray,
  protocol,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// In packaged app, native modules live in app.asar.unpacked
if (app.isPackaged) {
  const mod = require('module');
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
  if (!mod.globalPaths.includes(unpacked)) {
    mod.globalPaths.unshift(unpacked);
  }
}

// Fix PATH on macOS/Linux when launched from Finder (GUI apps don't inherit shell PATH).
// fix-path v4+ is ESM-only, so we replicate its logic inline using execSync.
if (process.platform !== 'win32') {
  try {
    const { execSync } = require('child_process');
    const shell = process.env.SHELL || '/bin/zsh';
    const shellPath = execSync(`${shell} -l -c 'echo $PATH'`, {
      timeout: 3000,
      encoding: 'utf8',
    }).trim();
    if (shellPath) process.env.PATH = shellPath;
  } catch (e) {
    console.warn('[Main] fix-path failed:', e?.message);
  }
  // Supplement with common binary dirs that fix-path may miss (e.g. Apple Silicon Homebrew,
  // NVM, Volta, Pyenv) so that MCP stdio processes can find node/npx/uvx/python/etc.
  try {
    const os = require('os');
    const home = os.homedir();
    const extraPaths = [
      '/opt/homebrew/bin',   // Homebrew on Apple Silicon
      '/opt/homebrew/sbin',
      '/usr/local/bin',      // Homebrew on Intel / system tools
      '/usr/local/sbin',
      `${home}/.volta/bin`,             // Volta
      `${home}/.pyenv/shims`,           // Pyenv
      `${home}/.pyenv/bin`,
      `${home}/.local/bin`,             // pip install --user / uv / uvx
      `${home}/.cargo/bin`,             // Rust/Cargo
    ];
    const currentParts = (process.env.PATH || '').split(':');
    for (const p of extraPaths) {
      if (!currentParts.includes(p)) currentParts.push(p);
    }
    // NVM: dynamically resolve the active version via ~/.nvm/alias/default
    try {
      const nvmAliasDefault = path.join(home, '.nvm', 'alias', 'default');
      if (fs.existsSync(nvmAliasDefault)) {
        let nvmVersion = fs.readFileSync(nvmAliasDefault, 'utf8').trim();
        // Follow lts/* aliases (e.g. lts/iron -> reads alias/lts/iron)
        if (nvmVersion.startsWith('lts/')) {
          const ltsFile = path.join(home, '.nvm', 'alias', nvmVersion);
          if (fs.existsSync(ltsFile)) nvmVersion = fs.readFileSync(ltsFile, 'utf8').trim();
        }
        if (!nvmVersion.startsWith('v')) nvmVersion = `v${nvmVersion}`;
        const nvmBin = path.join(home, '.nvm', 'versions', 'node', nvmVersion, 'bin');
        if (!currentParts.includes(nvmBin)) currentParts.push(nvmBin);
      } else {
        // Fallback: add the latest installed NVM version
        const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
        if (fs.existsSync(nvmVersionsDir)) {
          const versions = fs.readdirSync(nvmVersionsDir).sort().reverse();
          if (versions.length > 0) {
            const nvmBin = path.join(nvmVersionsDir, versions[0], 'bin');
            if (!currentParts.includes(nvmBin)) currentParts.push(nvmBin);
          }
        }
      }
    } catch (nvmErr) {
      console.warn('[Main] NVM PATH detection failed:', nvmErr?.message);
    }
    process.env.PATH = currentParts.join(':');
  } catch (e) {
    console.warn('[Main] PATH augmentation failed:', e?.message);
  }
}

// Register custom protocol scheme as privileged before app is ready
// This allows the app:// protocol to work like https:// with full privileges
// dome:// for OAuth callbacks (MCP backlinks)
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
  {
    scheme: 'dome',
    privileges: {
      standard: true,
      secure: true,
    },
  },
]);

// Single instance lock - on Windows/Linux, second instance receives dome:// URL for OAuth callback
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, commandLine) => {
    const url = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('dome://'));
    if (url) {
      if (mcpOauth.handleOAuthCallback(url)) {
        console.log('[MCP OAuth] Callback received via second-instance');
      } else {
        const handled = await handleDomeUrl(url, {
          database,
          windowManager,
          nativeTheme,
        });
        if (handled) {
          console.log('[DeepLink] Handled via second-instance');
        }
      }
    }
    const win = windowManager?.get?.('main');
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const windowManager = require('./window-manager.cjs');
const database = require('./database.cjs');
const initModule = require('./init.cjs');
const fileStorage = require('./file-storage.cjs');
const thumbnail = require('./thumbnail.cjs');
const cropImage = require('./crop-image.cjs');
const webScraper = require('./web-scraper.cjs');
const youtubeService = require('./youtube-service.cjs');
const ollamaService = require('./ollama-service.cjs');
const ollamaManager = require('./ollama-manager.cjs');
const aiToolsHandler = require('./ai-tools-handler.cjs');
const excelToolsHandler = require('./excel-tools-handler.cjs');
const pptToolsHandler = require('./ppt-tools-handler.cjs');
const documentExtractor = require('./document-extractor.cjs');
const documentGenerator = require('./document-generator.cjs');
const docxConverter = require('./docx-converter.cjs');
const authManager = require('./auth-manager.cjs');
const personalityLoader = require('./personality-loader.cjs');
const aiCloudService = require('./ai-cloud-service.cjs');
const updateService = require('./update-service.cjs');
const ttsService = require('./tts-service.cjs');
const notebookPython = require('./notebook-python.cjs');
const mcpOauth = require('./mcp-oauth.cjs');
const { handleDomeUrl } = require('./deep-link-handler.cjs');
const calendarNotificationService = require('./calendar-notification-service.cjs');
const automationService = require('./automation-service.cjs');
const runEngine = require('./run-engine.cjs');
const { validateSender, sanitizePath, validateUrl } = require('./security.cjs');
const resourceIndexer = require('./resource-indexer.cjs');

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

// Install development tools (React DevTools)
// Set SKIP_DEVTOOLS=1 to skip if you get sandbox/renderer errors
async function installExtensions() {
  if (!isDev) return;
  if (process.env.SKIP_DEVTOOLS === '1') return;

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
    console.error('❌ Error installing extensions:', error.message || error);
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

  // When user clicks the window close button, hide to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
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

// Flag to distinguish tray-hide from a real quit
let isQuitting = false;
// Tray icon instance (kept in module scope to prevent GC)
let appTray = null;

/**
 * Create the system tray icon with a context menu.
 * Called once after the main window is ready.
 */
function createTray(mainWindow) {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../assets');

  // macOS uses a template image (18x18, white/black auto-switching for menu bar)
  const trayIconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png';
  const trayIconPath = path.join(RESOURCES_PATH, trayIconName);
  const fallbackIconPath = path.join(RESOURCES_PATH, 'icon.png');

  const resolvedIconPath = fs.existsSync(trayIconPath)
    ? trayIconPath
    : fs.existsSync(fallbackIconPath)
    ? fallbackIconPath
    : null;

  if (!resolvedIconPath) {
    console.warn('[Tray] No icon found, skipping tray creation');
    return;
  }

  appTray = new Tray(resolvedIconPath);
  if (process.platform === 'darwin') {
    // Template image auto-adapts to light/dark menu bar
    appTray.setImage(resolvedIconPath);
  }
  appTray.setToolTip('Dome');

  const buildContextMenu = () => Menu.buildFromTemplate([
    {
      label: 'Abrir Dome',
      click: () => {
        const win = windowManager.get('main');
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Automatizaciones activas',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Salir de Dome',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  appTray.setContextMenu(buildContextMenu());

  // Single click on tray icon shows/hides the main window
  appTray.on('click', () => {
    const win = windowManager.get('main');
    if (!win || win.isDestroyed()) {
      createWindow();
      return;
    }
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  // Double-click on Windows also opens the window
  appTray.on('double-click', () => {
    const win = windowManager.get('main');
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
}

/**
 * Enable auto-launch on first install (can be toggled later from settings).
 */
function configureFirstLaunchAutoStart() {
  try {
    const queries = database.getQueries();
    const already = queries.getSetting.get('auto_launch_initialized');
    if (!already) {
      // First install — enable start-at-login by default
      app.setLoginItemSettings({ openAtLogin: true });
      queries.setSetting.run('auto_launch_initialized', '1');
      console.log('[AutoLaunch] Enabled auto-launch on first install');
    }
  } catch (err) {
    console.warn('[AutoLaunch] Could not configure first-launch auto-start:', err?.message);
  }
}

// App lifecycle events
app.on('window-all-closed', () => {
  // When tray is active, keep the app alive even when all windows are closed
  if (appTray) return;
  // Respect macOS convention of keeping app in memory
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Re-create window on macOS when dock icon is clicked
  const win = windowManager.get('main');
  if (!win || win.isDestroyed()) {
    createWindow();
  } else {
    win.show();
    win.focus();
  }
});

// MIME types for protocol handler (fs.readFileSync works with asar; net.fetch may not)
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.cjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return mime[ext] || 'application/octet-stream';
}

function serveFile(filePath) {
  const data = fs.readFileSync(filePath);
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': getMimeType(filePath) },
  });
}

// Initialize app
app
  .whenReady()
  .then(async () => {
    // Register custom protocol handler for serving static files
    // This allows Vite build to work with absolute paths
    const outDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist')
      : path.join(__dirname, '../dist');
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
          return serveFile(cached.path);
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
            return serveFile(indexPath);
          }
          fileCache.set(cacheKey, { exists: false, timestamp: Date.now() });
          return new Response('Not Found', { status: 404 });
        }
        // Regular file
        fileCache.set(cacheKey, { exists: true, path: normalizedPath, timestamp: Date.now() });
        return serveFile(normalizedPath);
      } catch (err) {
        // Log the failure for debugging
        console.error('[Protocol] File not found:', normalizedPath, err.message);
        // For SPA routing: if file doesn't exist and it's not a static asset,
        // fallback to index.html to let React Router handle it
        const isStaticAsset = /\.(js|mjs|cjs|css|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i.test(normalizedPath);

        if (!isStaticAsset) {
          const indexPath = path.join(outDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            fileCache.set(cacheKey, { exists: true, path: indexPath, timestamp: Date.now() });
            return serveFile(indexPath);
          }
        }

        fileCache.set(cacheKey, { exists: false, timestamp: Date.now() });
        return new Response('Not Found', { status: 404 });
      }
    });

    console.log('[Protocol] app:// protocol registered successfully');

    // Register dome:// for OAuth callbacks (MCP backlinks)
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('dome', process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('dome');
    }

    // Handle OAuth callback and deep links when user is redirected to dome://...
    if (process.platform === 'darwin') {
      app.on('open-url', async (event, url) => {
        event.preventDefault();
        if (mcpOauth.handleOAuthCallback(url)) {
          console.log('[MCP OAuth] Callback received and processed');
        } else {
          const handled = await handleDomeUrl(url, {
            database,
            windowManager,
            nativeTheme,
          });
          if (handled) {
            console.log('[DeepLink] Handled via open-url');
          }
        }
      });
    }

    // Cold start on Windows/Linux: URL may be in argv (handle after database is ready)

    setupUserDataFolder();
    // Initialize file storage
    fileStorage.initStorage();
    // Database initialization is now handled by initModule
    // but we still need to ensure it's ready
    database.initDatabase();

    excelToolsHandler.setWindowManager(windowManager);
    pptToolsHandler.setWindowManager(windowManager);
    aiToolsHandler.setWindowManager(windowManager);

    // Register all IPC handlers (modularized in electron/ipc/)
    registerAll({
      app,
      windowManager,
      database,
      initModule,
      fileStorage,
      thumbnail,
      cropImage,
      webScraper,
      youtubeService,
      ollamaService,
      ollamaManager,
      aiToolsHandler,
      aiCloudService,
      ttsService,
    documentExtractor,
    documentGenerator,
    docxConverter,
    authManager,
    personalityLoader,
    notebookPython,
    validateSender,
      sanitizePath,
      validateUrl,
    });

    // IMPORTANTE: Crear ventana PRIMERO para que la UI se muestre inmediatamente
    // La inicializacion de LanceDB puede fallar o bloquearse con modulos nativos
    const mainWindow = await createWindow();

    // Create tray icon for background operation (automations, notifications)
    createTray(mainWindow);

    // Enable auto-launch on first install
    configureFirstLaunchAutoStart();

    // Cold start on Windows/Linux: dome:// URL may be in argv - handle after window exists
    if (process.platform !== 'darwin') {
      const coldStartUrl = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('dome://'));
      if (coldStartUrl) {
        if (mcpOauth.handleOAuthCallback(coldStartUrl)) {
          console.log('[MCP OAuth] Callback received on cold start');
        } else {
          const handled = await handleDomeUrl(coldStartUrl, {
            database,
            windowManager,
            nativeTheme,
          });
          if (handled) {
            console.log('[DeepLink] Handled on cold start');
          }
        }
      }
    }

    // Register dome link handler for will-navigate and setWindowOpenHandler
    windowManager.setDomeLinkHandler((url) =>
      handleDomeUrl(url, { database, windowManager, nativeTheme })
    );

    // Initialize auto-updater (only in packaged app)
    updateService.init(
      mainWindow,
      (status) => windowManager.broadcast('updater:status', status)
    );
    // Ensure tray is destroyed and isQuitting is set synchronously before
    // the updater calls app.quit() / app.exit() — critical on macOS where
    // the tray can keep the process alive after windows close.
    updateService.setBeforeQuitCallback(() => {
      isQuitting = true;
      if (appTray) {
        appTray.destroy();
        appTray = null;
      }
    });

    // Initialize calendar notification service (upcoming events broadcast)
    calendarNotificationService.init(windowManager);
    runEngine.init(windowManager, database);
    automationService.init(windowManager, database);

    // Initialize the app in background (SQLite settings, filesystem)
    initModule.initializeApp().catch(err => {
      console.error('❌ Background initialization failed:', err);
    });

    // Start periodic auto-indexing (startup sweep + hourly)
    resourceIndexer.startAutoIndexing({ database, fileStorage, windowManager });

    // Native JS doc-indexer needs no startup — available immediately

    // Schedule orphan file cleanup after app is ready (non-blocking)
    setTimeout(() => {
      try {
        console.log('[App] Running automatic orphan file cleanup...');
        const queries = database.getQueries();
        const resourcePaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);
        const imagePaths = (queries.getResourceImageInternalPaths?.all?.() ?? []).map((r) => r.internal_path);
        const internalPaths = [...resourcePaths, ...imagePaths];
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

      // DB-level orphan cleanup
      try {
        database.getDB().prepare(
          `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM resource_tags)`
        ).run();
      } catch (e) { /* non-fatal */ }
    }, 30000); // 30 seconds delay to let app stabilize
  })
  .catch(console.error);

// Cleanup before quit
app.on('before-quit', async () => {
  isQuitting = true;
  console.log('👋 Cerrando Dome...');
  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
  calendarNotificationService.stop();
  automationService.stop();
  runEngine.stop();
  // doc-indexer is native JS, no subprocess to stop
  await webScraper.close?.();
  await ollamaManager.cleanup();
  database.closeDB();
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  if (windowManager && typeof windowManager.broadcast === 'function') {
    const err = error instanceof Error ? error : new Error(String(error));
    windowManager.broadcast('analytics:event', {
      event: 'main_process_exception',
      properties: {
        type: 'uncaughtException',
        message: err.message,
        stack: err.stack,
      },
    });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  if (windowManager && typeof windowManager.broadcast === 'function') {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    windowManager.broadcast('analytics:event', {
      event: 'main_process_exception',
      properties: {
        type: 'unhandledRejection',
        message,
        stack,
      },
    });
  }
});
