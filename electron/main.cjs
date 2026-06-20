/* eslint-disable no-console */
// Increase default max listeners to avoid spurious warnings from concurrent
// fetch/stream AbortSignal usage (MCP servers, AI streams, etc.)
require('events').EventEmitter.defaultMaxListeners = 30;

// DEP0040: deps transitivas (whatwg-url/tr46 vía node-fetch) hacen `require('punycode')`,
// que carga el módulo *incorporado* y deprecado de Node. En Electron ese warning sí se
// imprime a stderr. En vez de silenciarlo (un listener de 'warning' NO evita el print),
// redirigimos `require('punycode')` al paquete userland equivalente: así el built-in
// deprecado nunca se carga y DEP0040 desaparece de raíz. Debe ir antes de cargar deps.
(() => {
  const Module = require('module');
  const userlandPunycode = require('punycode/');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'punycode' || request === 'node:punycode') {
      return userlandPunycode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
})();

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

// Child processes read NODE_OPTIONS before JS runs far enough for app.isPackaged; strip it when this
// file is loaded from the packaged asar (not from the dev repo path).
if (process.env.NODE_OPTIONS && __dirname.includes('app.asar')) {
  delete process.env.NODE_OPTIONS;
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
  session,
  desktopCapturer,
  systemPreferences,
} = require('electron');

// Pending display-media source ID.
// The renderer sets this via IPC immediately before calling getDisplayMedia() so the
// setDisplayMediaRequestHandler can select the correct source without Chromium's picker.
// Only one getDisplayMedia call can be in-flight at a time per renderer, so a single
// variable (no per-window keying) is sufficient.
const pendingDisplayMediaSources = {
  sourceId: null,
  set(id) { this.sourceId = id; },
  consume() { const id = this.sourceId; this.sourceId = null; return id; },
};
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Isolated userData per worktree or agent run (set before any heavy main init).
if (process.env.DOME_PROFILE && String(process.env.DOME_PROFILE).trim()) {
  const safe = String(process.env.DOME_PROFILE).replace(/[^a-zA-Z0-9._-]/g, '_');
  const def = app.getPath('userData');
  const next = path.join(path.dirname(def), `${path.basename(def)}-wt-${safe}`);
  app.setPath('userData', next);
  console.log('[Main] DOME_PROFILE active — userData:', next);
}

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

const windowManager = require('./core/window-manager.cjs');
const database = require('./core/database.cjs');
const initModule = require('./core/init.cjs');
const fileStorage = require('./storage/file-storage.cjs');
const thumbnail = require('./documents/thumbnail.cjs');
const cropImage = require('./tools/crop-image.cjs');
const webScraper = require('./feeders/web-scraper.cjs');
const youtubeService = require('./feeders/youtube-service.cjs');
const ollamaService = require('./ollama/ollama-service.cjs');
const { getOllamaManager, cleanupOllamaManagerIfLoaded } = require('./ollama/ollama-manager-lazy.cjs');
const aiToolsHandler = require('./tools/ai-tools-handler.cjs');
const excelToolsHandler = require('./tools/excel-tools-handler.cjs');
const docxToolsHandler = require('./tools/docx-tools-handler.cjs');
const pptToolsHandler = require('./tools/ppt-tools-handler.cjs');
const documentExtractor = require('./documents/document-extractor.cjs');
const documentGenerator = require('./documents/document-generator.cjs');
const documentStaging = require('./documents/document-staging.cjs');
const docxConverter = require('./documents/docx-converter.cjs');
const authManager = require('./auth/auth-manager.cjs');
const personalityLoader = require('./personality/personality-loader.cjs');
const updateService = require('./core/update-service.cjs');
const ttsService = require('./transcription/tts-service.cjs');
const notebookPython = require('./documents/notebook-python.cjs');
const mcpOauth = require('./mcp/mcp-oauth.cjs');
const { handleDomeUrl } = require('./core/deep-link-handler.cjs');
const calendarNotificationService = require('./calendar/calendar-notification-service.cjs');
const calendarSyncScheduler = require('./calendar/calendar-sync-scheduler.cjs');
const githubSyncService = require('./github/github-sync-service.cjs');
const githubSyncScheduler = require('./github/github-sync-scheduler.cjs');
const automationService = require('./agents/automation-service.cjs');
const runRetention = require('./agents/run-retention.cjs');
const errorNotify = require('./core/error-notify.cjs');
const runEngine = require('./agents/run-engine.cjs');
const { validateSender, sanitizePath, validateUrl } = require('./core/security.cjs');
const { setupContentSecurityPolicy } = require('./core/csp.cjs');
const semanticIndexScheduler = require('./storage/semantic-index-scheduler.cjs');

// IPC handlers (modularized)
const { registerAll } = require('./ipc/index.cjs');
const transcriptionShortcut = require('./transcription/transcription-shortcut.cjs');
const { useViteDevServer } = require('./core/runtime-env.cjs');

// Modo desarrollo (Vite): nunca en app empaquetada
const isDev = useViteDevServer();
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
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
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
        // Ctrl+W is reserved for closing the active tab in the renderer.
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' }
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
  if (app.isPackaged) return;
  if (!isDev) return;
  if (process.env.SKIP_DEVTOOLS === '1') return;

  try {
    const { REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
    const { installExtensionFromChromeStore } = require('./core/install-devtools-extension.cjs');

    await installExtensionFromChromeStore(REACT_DEVELOPER_TOOLS, {
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
  if (isDev) {
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
      // Contrato responsive (03/T06): la app debe ser usable hasta 800×600
      // (media ventana en un portátil de 13"); el CSS colapsa paneles antes.
      minWidth: 800,
      minHeight: 600,
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

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin';
      const modifierKey = isMac ? input.meta : input.control;
      if (modifierKey && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  try {
    const row = database.getQueries().getSetting.get('ai_provider');
    const provider = String(row?.value || '').toLowerCase();
    if (provider === 'ollama') {
      getOllamaManager().ensureInitialized(mainWindow);
      console.log('[Main] Ollama embedded manager ready (ai_provider=ollama)');
    }
  } catch (e) {
    console.warn('[Main] Ollama provider gate:', e?.message);
  }

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

  const openMainWindow = () => {
    const win = windowManager.get('main');
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  };

  const quitApp = () => {
    isQuitting = true;
    app.quit();
  };

  appTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dome', click: openMainWindow },
      { type: 'separator' },
      { label: 'Quit', click: quitApp },
    ]),
  );

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
      queries.setSetting.run('auto_launch_initialized', '1', Date.now());
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
    setupContentSecurityPolicy(isDev);

    // Remove stale staging files left by previous crashes or interruptions.
    documentStaging.cleanupStaleStagings();

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

    // ─── Permission request/check handlers ──────────────────────────────────
    // Without these, Chromium auto-grants every Web API permission request.
    // Deny all by default; allow only the media permissions Dome actually uses,
    // and only from trusted first-party origins.
    const _TRUSTED_ORIGIN_PREFIXES = [
      'file://',
      'http://localhost',
      'app://dome/',
      'app://dome',
    ];
    // speaker-selection: Chromium checks this for audio output / loopback paths with getUserMedia & display capture.
    // Denying it logged "Check denied speaker-selection" and could trigger internal null-iteration errors.
    // background-sync: often queried by SW / tooling; we allow on first-party only.
    const _ALLOWED_PERMISSIONS = new Set([
      'media',
      'microphone',
      'camera',
      'display-capture',
      'speaker-selection',
      'background-sync',
      'clipboard-read',
      'clipboard-write',
      'clipboard-sanitized-write',
      'fullscreen',
    ]);

    // Denegaciones habituales que no aportan (PWA, mapas, hardware); no spamear consola.
    // DevTools hace cientos de comprobaciones de permisos al abrir.
    const _QUIET_DENY_PERMISSIONS = new Set([
      'geolocation',
      'web-app-installation',
      'midi',
      'serial',
      'usb',
      'hid',
      'bluetooth',
      'local-fonts',
      'window-management',
      'file-system',
      'idle-detection',
    ]);

    const _logPermissions =
      process.env.DOME_LOG_PERMISSIONS === '1' || process.env.DOME_LOG_PERMISSIONS === 'true';

    function _isTrustedOrigin(origin) {
      if (!origin) return false;
      return _TRUSTED_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix));
    }

    function _isDevtoolsOrigin(origin) {
      if (!origin || typeof origin !== 'string') return false;
      return (
        origin.startsWith('devtools://') ||
        origin.startsWith('chrome-devtools://') ||
        origin.includes('://devtools') // some builds
      );
    }

    /**
     * RequestHandler: pocos eventos; no spamear orígenes vacíos, DevTools, ni permisos que nunca usamos.
     * CheckHandler: no loguear (Chromium hace cientos de checks); usar DOME_LOG_PERMISSIONS=1 para depurar.
     */
    function _shouldLogRequestDenial(permission, origin) {
      if (_logPermissions) return true;
      if (_QUIET_DENY_PERMISSIONS.has(permission)) return false;
      if (_isDevtoolsOrigin(origin)) return false;
      if (!origin || origin === '(unknown)') return false;
      return true;
    }

    // Async handler: called when a renderer explicitly requests a permission
    // (e.g. getUserMedia, getDisplayMedia). Must call callback(boolean).
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const origin = details?.requestingUrl || webContents?.getURL?.() || '';
      const trusted = _isTrustedOrigin(origin) && _ALLOWED_PERMISSIONS.has(permission);
      if (!trusted && _shouldLogRequestDenial(permission, origin || '(unknown)')) {
        console.warn(`[Permissions] Denied "${permission}" request from "${origin || '(unknown)'}"`);
      }
      callback(trusted);
    });

    // Sync handler: called for background permission checks (navigator.permissions.query,
    // feature-policy evaluation) before the user-facing prompt. Must return boolean.
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const origin = requestingOrigin || details?.requestingUrl || webContents?.getURL?.() || '';
      const trusted = _isTrustedOrigin(origin) && _ALLOWED_PERMISSIONS.has(permission);
      if (!trusted && _logPermissions) {
        console.warn(`[Permissions] Check denied "${permission}" from "${origin || '(unknown)'}"`);
      }
      return trusted;
    });
    // ─── End permission handlers ─────────────────────────────────────────────

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

    try {
      const dbBackupScheduler = require('./core/db-backup-scheduler.cjs');
      dbBackupScheduler.init(database);
    } catch (e) {
      console.warn('[Main] db backup scheduler:', e?.message || e);
    }

    // Seed bundled SKILL.md packs to ~/.dome/skills/ on first boot (idempotent)
    try {
      const { seedBundledSkills } = require('./marketplace/skills-bootstrap.cjs');
      seedBundledSkills(database.getDB());
    } catch (e) {
      console.warn('[Main] skills bootstrap:', e?.message || e);
    }

    // Seed onboarding guide notes on first boot (guide_seeded_v2 + optional guide_body_repaired_v2)
    try {
      const { seedGuide } = require('./core/guide-bootstrap.cjs');
      seedGuide(database.getDB());
    } catch (e) {
      console.warn('[Main] guide bootstrap:', e?.message || e);
    }

    const lancedbSemantic = require('./services/lancedb-semantic.cjs');
    const embeddingsService = require('./services/embeddings.service.cjs');
    try {
      await lancedbSemantic.init(app.getPath('userData'));
      await lancedbSemantic.migrateChunksFromSqliteIfNeeded(database.getDB());
      await lancedbSemantic.bootstrapLexFromSqliteIfNeeded(database.getDB());
    } catch (lanceErr) {
      console.error('[Main] LanceDB:', lanceErr?.message || lanceErr);
    }

    try {
      const q = database.getQueries();
      const guard = q.getSetting.get('embeddings_refactor_v1');
      if (guard?.value !== '1') {
        const fs = require('fs');
        const path = require('path');
        const cacheDir = path.join(app.getPath('userData'), 'transformers-cache');
        try {
          fs.rmSync(cacheDir, { recursive: true, force: true });
          console.log('[Main] transformers-cache eliminado (refactor embeddings)');
        } catch {
          /* ignore */
        }
        q.setSetting.run('embeddings_refactor_v1', '1', Date.now());
      }
    } catch (e) {
      console.warn('[Main] embeddings refactor guard:', e?.message || e);
    }

    excelToolsHandler.setWindowManager(windowManager);
    docxToolsHandler.setWindowManager(windowManager);
    pptToolsHandler.setWindowManager(windowManager);
    aiToolsHandler.setWindowManager(windowManager);

    // Dev-only: capture IPC handlers so the HTTP bridge can relay them to a
    // browser tab. MUST run before registerAll(). No-op in packaged builds.
    if (isDev) {
      try {
        require('./core/dev-ipc-bridge.cjs').installIpcCapture();
      } catch (e) {
        console.warn('[Main] dev IPC capture:', e?.message || e);
      }
    }

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
      getOllamaManager,
      aiToolsHandler,
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
      pendingDisplayMediaSources,
    });

    // Dev-only: start the HTTP IPC bridge so a browser tab can drive the app.
    if (isDev) {
      try {
        require('./core/dev-ipc-bridge.cjs').startDevIpcBridge({
          getSender: () => windowManager.get('main')?.webContents,
        });
      } catch (e) {
        console.warn('[Main] dev IPC bridge:', e?.message || e);
      }
    }

    try {
      transcriptionShortcut.registerFromDatabase(database, windowManager);
    } catch (shortcutErr) {
      console.warn('[Main] Transcription shortcut init:', shortcutErr?.message);
    }

    // Auto-start Dome MCP server if enabled in settings
    try {
      const q = database.getQueries();
      const mcpEnabled = q.getSetting?.get('dome_mcp_enabled');
      if (mcpEnabled?.value === '1') {
        const domeMcpServer = require('./mcp/dome-mcp-server.cjs');
        const portRow = q.getSetting?.get('dome_mcp_port');
        const port = portRow?.value ? parseInt(portRow.value, 10) : 37214;
        domeMcpServer.start(port).catch((e) =>
          console.warn('[Main] DomeMCP auto-start failed:', e?.message),
        );
      }
    } catch (mcpErr) {
      console.warn('[Main] DomeMCP auto-start check failed:', mcpErr?.message);
    }

    // Crear ventana principal en cuanto la base de datos está lista (LanceDB ya se inicializó arriba).
    const mainWindow = await createWindow();

    // One-time background semantic chunk reindex; non-blocking (requires embeddings config)
    setTimeout(() => {
      try {
        const q = database.getQueries();
        if (!embeddingsService.isConfigured(q)) return;
        const done = q.getSetting.get('semantic_initial_reindex_done_v2');
        if (done?.value === '1') return;
        const semanticScheduler = require('./storage/semantic-index-scheduler.cjs');
        semanticScheduler.init(database);
        void semanticScheduler
          .getIndexer()
          .reindexAll({
            skipSemanticRelations: true,
            onProgress: (p) => {
              try {
                windowManager.broadcast('semantic:progress', p);
              } catch {
                /* ignore */
              }
            },
          })
          .then(() => {
            try {
              q.setSetting.run('semantic_initial_reindex_done_v2', '1', Date.now());
            } catch {
              /* ignore */
            }
          });
      } catch (e) {
        console.warn('[Main] semantic initial reindex:', e?.message || e);
      }
    }, 90_000);

    // Modern Electron display-media handler for system/meeting audio capture.
    // The renderer calls window.electron.transcription.setDisplayMediaSource(id)
    // BEFORE calling navigator.mediaDevices.getDisplayMedia(), storing the desired
    // source ID here so we can bypass Chromium's own picker and use the right source.
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        // Only start system audio (loopback) when the renderer asked for audio. The hub uses
        // getDisplayMedia({ audio: false }) for live video preview; always forcing loopback here
        // caused a second Core Audio tap alongside real capture and could crash or kill the app on macOS.
        const audioRequested = request?.audioRequested === true;

        // Consume the pending source ID set by the renderer just before calling getDisplayMedia()
        const sourceId = pendingDisplayMediaSources.consume();

        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1, height: 1 }, // minimal — we only need IDs
        });

        let videoSource = sources[0]; // fallback: first screen
        if (sourceId) {
          const match = sources.find((s) => s.id === sourceId);
          if (match) videoSource = match;
        }

        if (!videoSource) {
          callback({});
          return;
        }

        // 'loopback' captures system audio on macOS 13+ and Windows when audioRequested is true.
        if (audioRequested) {
          callback({ video: videoSource, audio: 'loopback' });
        } else {
          callback({ video: videoSource });
        }
      } catch (err) {
        console.error('[DisplayMedia] setDisplayMediaRequestHandler error:', err?.message);
        try {
          callback({});
        } catch (cbErr) {
          console.error('[DisplayMedia] callback error:', cbErr?.message);
        }
      }
    });

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
    calendarSyncScheduler.init(windowManager);
    githubSyncService.init(windowManager);
    githubSyncScheduler.init(windowManager);
    runEngine.init(windowManager, database, ttsService);
    automationService.init(windowManager, database);
    runRetention.init();
    errorNotify.init(windowManager);

    // Initialize the app in background (SQLite settings, filesystem)
    initModule.initializeApp().catch(err => {
      console.error('❌ Background initialization failed:', err);
    });

    semanticIndexScheduler.init(database);
    semanticIndexScheduler.startAutoIndexing();

    // Watch the Markdown vault for external edits (Obsidian/Finder/etc.).
    try {
      const vaultWatcher = require('./storage/vault-watcher.cjs');
      vaultWatcher.start({ database, fileStorage, semanticIndexScheduler, windowManager });
    } catch (err) {
      console.warn('[App] Vault watcher not started:', err?.message || err);
    }

    // Schedule orphan file cleanup after app is ready (non-blocking)
    setTimeout(() => {
      try {
        console.log('[App] Running automatic orphan file cleanup...');
        const queries = database.getQueries();
        const resourcePaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);
        const internalPaths = [...resourcePaths];
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

app.on('before-quit', async () => {
  isQuitting = true;
  console.log('👋 Cerrando Dome...');
  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
  transcriptionShortcut.unregisterAll();
  calendarNotificationService.stop();
  calendarSyncScheduler.stop();
  automationService.stop();
  runRetention.stop();
  runEngine.stop();
  try {
    windowManager.closeAll();
  } catch (e) {
    console.warn('[Main] windowManager.closeAll failed:', e?.message);
  }
  try {
    require('./mcp/mcp-client.cjs').closeAllMcpClients?.();
  } catch (e) {
    console.warn('[Main] MCP client cleanup failed:', e?.message);
  }
  try {
    require('./ipc/sync/cloud-sync.cjs').disposeCloudSync();
  } catch (e) { /* non-fatal */ }
  semanticIndexScheduler.stopAutoIndexing?.();
  try { require('./storage/vault-watcher.cjs').stop(); } catch (e) { /* non-fatal */ }
  await webScraper.close?.();
  await cleanupOllamaManagerIfLoaded();
  try {
    await require('./core/observability.cjs').shutdownLangfuse();
  } catch (e) {
    console.warn('[Main] langfuse shutdown failed:', e?.message);
  }
  try {
    const semanticIndexScheduler = require('./storage/semantic-index-scheduler.cjs');
    const indexer = semanticIndexScheduler.getIndexer?.();
    if (indexer && typeof indexer.waitForIndexerIdle === 'function') {
      await indexer.waitForIndexerIdle();
    }
  } catch (e) {
    console.warn('[Main] semantic indexer idle wait skipped:', e?.message);
  }
  try {
    const dbBackupScheduler = require('./core/db-backup-scheduler.cjs');
    dbBackupScheduler.backupOnQuit();
    dbBackupScheduler.stop();
  } catch (e) {
    console.warn('[Main] db backup on quit failed:', e?.message);
  }
  database.closeDB();
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  try {
    const logger = require('./core/logger.cjs');
    logger.error('main', 'uncaughtException', { error: error?.message, stack: error?.stack });
  } catch { /* logging must never crash the handler */ }
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
  try {
    const logger = require('./core/logger.cjs');
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error('main', 'unhandledRejection', { error: message, stack: reason instanceof Error ? reason.stack : undefined });
  } catch { /* logging must never crash the handler */ }
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
