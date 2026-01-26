# Electron Best Practices - Dome

Guía completa de desarrollo Electron basada en las mejores prácticas de 2026.

## Tabla de Contenidos

1. [Arquitectura y Procesos](#arquitectura-y-procesos)
2. [Seguridad](#seguridad)
3. [Gestión de Ventanas](#gestión-de-ventanas)
4. [Comunicación IPC](#comunicación-ipc)
5. [Gestión de Memoria](#gestión-de-memoria)
6. [Patrones Comunes](#patrones-comunes)
7. [Referencias](#referencias)

---

## Arquitectura y Procesos

### Modelo de Procesos

Electron usa un modelo multi-proceso similar a Chrome:

```
┌─────────────────────────┐
│   Main Process          │  ← Node.js completo
│   (electron/main.cjs)   │  ← Gestión de ventanas
│                         │  ← APIs nativas del SO
└─────────────────────────┘
           │
           ├──────────────────┬──────────────────┐
           │                  │                  │
    ┌──────▼──────┐    ┌──────▼──────┐   ┌──────▼──────┐
    │  Renderer 1 │    │  Renderer 2 │   │  Renderer N │
    │  (Next.js)  │    │  (Settings) │   │   (Modal)   │
    │             │    │             │   │             │
    └─────────────┘    └─────────────┘   └─────────────┘
         ▲                   ▲                  ▲
         │                   │                  │
    ┌────┴────┐         ┌────┴────┐       ┌────┴────┐
    │ Preload │         │ Preload │       │ Preload │
    └─────────┘         └─────────┘       └─────────┘
```

**Main Process:**
- Un solo proceso principal
- Acceso completo a Node.js y APIs de Electron
- Gestiona ciclo de vida de la app
- Crea y gestiona ventanas (BrowserWindow)
- Acceso a APIs nativas del SO

**Renderer Process:**
- Un proceso por ventana
- Ejecuta código web (HTML/CSS/JS)
- Aislado por seguridad
- NO acceso directo a Node.js
- Comunicación vía IPC

**Preload Script:**
- Se ejecuta antes del renderer
- Tiene acceso a Node.js y DOM
- Puente seguro entre main y renderer vía `contextBridge`

---

## Seguridad

### Configuración de Seguridad Obligatoria

```javascript
// electron/main.cjs
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    // 🔒 CRÍTICO: Aislamiento de contexto
    contextIsolation: true,        // ✅ Siempre true

    // 🔒 CRÍTICO: No integración de Node.js
    nodeIntegration: false,        // ✅ Siempre false

    // 🔒 CRÍTICO: Sandbox del renderer
    sandbox: true,                 // ✅ Recomendado

    // 🔒 Seguridad web
    webSecurity: true,             // ✅ No deshabilitar

    // 🔒 Preload script
    preload: path.join(__dirname, 'preload.cjs'),

    // 🔒 Deshabilitar características peligrosas
    enableRemoteModule: false,     // ✅ Deprecated, no usar
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  }
});
```

### Principios de Seguridad

#### 1. **Nunca Confíes en el Renderer**

El renderer puede ser comprometido. SIEMPRE validar en el main process.

```javascript
// ❌ MAL - Confiar en datos del renderer
ipcMain.handle('delete-file', (event, filepath) => {
  fs.unlinkSync(filepath); // PELIGROSO: puede borrar cualquier archivo
});

// ✅ BIEN - Validar y sanitizar
ipcMain.handle('delete-file', (event, filepath) => {
  // 1. Validar sender
  if (!isAuthorizedWindow(event.sender)) {
    return { success: false, error: 'Unauthorized' };
  }

  // 2. Validar y sanitizar path
  const userDataPath = app.getPath('userData');
  const normalizedPath = path.normalize(filepath);
  if (!normalizedPath.startsWith(userDataPath)) {
    return { success: false, error: 'Invalid path' };
  }

  // 3. Validar que el archivo existe
  if (!fs.existsSync(normalizedPath)) {
    return { success: false, error: 'File not found' };
  }

  // 4. Ejecutar operación
  try {
    fs.unlinkSync(normalizedPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

#### 2. **Mínima Superficie de Ataque**

Exponer solo lo estrictamente necesario.

```javascript
// ❌ MAL - Exponer APIs completas
contextBridge.exposeInMainWorld('electron', {
  fs: require('fs'),           // PELIGROSO
  child_process: require('child_process'), // PELIGROSO
  ipcRenderer: ipcRenderer     // PELIGROSO
});

// ✅ BIEN - API mínima y específica
contextBridge.exposeInMainWorld('electron', {
  // Solo operaciones específicas y seguras
  saveFile: (data, filename) => ipcRenderer.invoke('file:save', data, filename),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  getAppVersion: () => ipcRenderer.invoke('app:version')
});
```

#### 3. **Validación de Sender**

Verificar que el mensaje viene de un renderer autorizado.

```javascript
// electron/main.cjs
const authorizedWindows = new Set();

function createWindow() {
  const mainWindow = new BrowserWindow({ /* ... */ });
  authorizedWindows.add(mainWindow.webContents.id);

  mainWindow.on('closed', () => {
    authorizedWindows.delete(mainWindow.webContents.id);
  });
}

ipcMain.handle('sensitive-operation', (event, data) => {
  // Validar que el sender es una ventana autorizada
  if (!authorizedWindows.has(event.sender.id)) {
    console.error('Unauthorized IPC call from:', event.sender.getURL());
    return { error: 'Unauthorized' };
  }

  // Validar la URL del sender
  const senderURL = event.sender.getURL();
  if (!senderURL.startsWith('file://') && !senderURL.startsWith('http://localhost')) {
    console.error('Invalid sender URL:', senderURL);
    return { error: 'Invalid origin' };
  }

  // Procesar operación...
});
```

#### 4. **Content Security Policy (CSP)**

```javascript
// electron/main.cjs
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' http://localhost:* ws://localhost:*",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')
    }
  });
});
```

---

## Gestión de Ventanas

### Patrón Singleton para Ventana Principal

```javascript
// electron/main.cjs
let mainWindow = null;

function createMainWindow() {
  // Reutilizar ventana existente
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Evitar flash blanco
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Mostrar cuando esté lista (sin flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Cleanup al cerrar
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.on('activate', () => {
  // macOS: recrear ventana al hacer click en el dock
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
```

### Gestión de Múltiples Ventanas

```javascript
// electron/window-manager.cjs
class WindowManager {
  constructor() {
    this.windows = new Map();
  }

  create(id, options) {
    // Prevenir duplicados
    if (this.windows.has(id)) {
      const win = this.windows.get(id);
      win.focus();
      return win;
    }

    const window = new BrowserWindow({
      ...options,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...options.webPreferences
      }
    });

    // Tracking
    this.windows.set(id, window);

    // Cleanup automático
    window.on('closed', () => {
      this.windows.delete(id);
    });

    window.once('ready-to-show', () => {
      window.show();
    });

    return window;
  }

  get(id) {
    return this.windows.get(id);
  }

  close(id) {
    const window = this.windows.get(id);
    if (window) {
      window.close();
    }
  }

  closeAll() {
    for (const window of this.windows.values()) {
      window.close();
    }
  }

  broadcast(channel, data) {
    for (const window of this.windows.values()) {
      window.webContents.send(channel, data);
    }
  }
}

module.exports = new WindowManager();
```

### Persistir Estado de Ventana

```javascript
// electron/main.cjs
const Store = require('electron-store');
const store = new Store();

function createWindow() {
  // Restaurar bounds guardados
  const defaultBounds = { width: 1200, height: 800, x: undefined, y: undefined };
  const bounds = store.get('windowBounds', defaultBounds);

  const mainWindow = new BrowserWindow({
    ...bounds,
    show: false,
    webPreferences: { /* ... */ }
  });

  // Guardar bounds al mover/redimensionar
  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  };

  // Debounce para no guardar en cada frame
  let saveBoundsTimer;
  mainWindow.on('resize', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveBounds, 500);
  });

  mainWindow.on('move', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveBounds, 500);
  });

  // Guardar estado maximizado
  mainWindow.on('maximize', () => store.set('windowMaximized', true));
  mainWindow.on('unmaximize', () => store.set('windowMaximized', false));

  // Restaurar estado maximizado
  if (store.get('windowMaximized')) {
    mainWindow.maximize();
  }

  return mainWindow;
}
```

### Prevenir Cierre con Confirmación

```javascript
mainWindow.on('close', (event) => {
  if (!app.isQuitting) {
    event.preventDefault();

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Cancelar', 'Salir'],
      title: 'Confirmar',
      message: '¿Estás seguro de que quieres salir?',
      detail: 'Los cambios sin guardar se perderán.'
    });

    if (choice === 1) {
      app.isQuitting = true;
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
```

---

## Comunicación IPC

### Patrón Request-Response (Recomendado)

```javascript
// Main Process (electron/main.cjs)
const { ipcMain } = require('electron');

ipcMain.handle('user:get', async (event, userId) => {
  // 1. Validar sender
  if (!isValidSender(event.sender)) {
    throw new Error('Unauthorized');
  }

  // 2. Validar args
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Invalid userId');
  }

  // 3. Procesar
  try {
    const user = await db.getUser(userId);
    return { success: true, data: user };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Preload (electron/preload.cjs)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getUser: (userId) => ipcRenderer.invoke('user:get', userId)
});

// Renderer (React component)
const user = await window.electron.getUser('user-123');
if (user.success) {
  setUserData(user.data);
} else {
  showError(user.error);
}
```

### Patrón One-Way (Main → Renderer)

```javascript
// Main Process
mainWindow.webContents.send('notification:new', {
  title: 'Nueva notificación',
  message: 'Tienes un nuevo mensaje'
});

// Preload
contextBridge.exposeInMainWorld('electron', {
  onNotification: (callback) => {
    // Strip event object para seguridad
    ipcRenderer.on('notification:new', (_event, data) => callback(data));

    // Retornar función de cleanup
    return () => {
      ipcRenderer.removeAllListeners('notification:new');
    };
  }
});

// Renderer (React)
useEffect(() => {
  const cleanup = window.electron.onNotification((notification) => {
    showNotification(notification);
  });

  return cleanup; // Cleanup al desmontar
}, []);
```

### Validación y Sanitización

```javascript
// Whitelist de canales permitidos
const ALLOWED_CHANNELS = {
  // Renderer → Main
  invoke: [
    'file:save',
    'file:open',
    'dialog:openFile',
    'user:get',
    'user:update'
  ],
  // Main → Renderer
  send: [
    'notification:new',
    'theme:changed',
    'update:available'
  ]
};

// En preload.cjs - Validar canales
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.invoke.includes(channel)) {
      throw new Error(`Channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.send.includes(channel)) {
      throw new Error(`Channel not allowed: ${channel}`);
    }
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  }
});

// En main.cjs - Validar argumentos
const { z } = require('zod');

const UserUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email()
});

ipcMain.handle('user:update', async (event, userData) => {
  // Validar con Zod
  try {
    const validData = UserUpdateSchema.parse(userData);
    return await db.updateUser(validData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.errors };
    }
    throw error;
  }
});
```

### Manejo de Archivos Grandes

```javascript
// Para archivos grandes, usar streams
ipcMain.handle('file:process-large', async (event, filepath) => {
  const readStream = fs.createReadStream(filepath);
  let progress = 0;

  readStream.on('data', (chunk) => {
    progress += chunk.length;
    // Enviar progreso al renderer
    event.sender.send('file:progress', progress);
  });

  return new Promise((resolve, reject) => {
    readStream.on('end', () => resolve({ success: true }));
    readStream.on('error', reject);
  });
});
```

---

## Gestión de Memoria

### Cleanup de Ventanas

```javascript
function createWindow() {
  const window = new BrowserWindow({ /* ... */ });

  // Almacenar listeners para cleanup
  const listeners = [];

  const on = (event, handler) => {
    window.on(event, handler);
    listeners.push({ event, handler });
  };

  on('resize', handleResize);
  on('move', handleMove);
  on('focus', handleFocus);

  // Cleanup completo
  window.on('closed', () => {
    // Remover todos los listeners
    listeners.forEach(({ event, handler }) => {
      window.removeListener(event, handler);
    });

    // Limpiar referencias
    listeners.length = 0;
  });
}
```

### WeakMap para Asociaciones

```javascript
// Asociar datos con ventanas sin prevenir GC
const windowData = new WeakMap();

function createWindow() {
  const window = new BrowserWindow({ /* ... */ });

  // Almacenar datos asociados
  windowData.set(window, {
    projectId: 'abc-123',
    userData: { /* ... */ }
  });

  // Cuando window sea destruido, los datos también se liberarán
}

// Acceder a datos
function getWindowData(window) {
  return windowData.get(window);
}
```

### Limitar Ventanas Abiertas

```javascript
const MAX_WINDOWS = 10;
const windows = new Set();

function createWindow() {
  if (windows.size >= MAX_WINDOWS) {
    dialog.showMessageBox({
      type: 'warning',
      message: `No puedes abrir más de ${MAX_WINDOWS} ventanas`
    });
    return null;
  }

  const window = new BrowserWindow({ /* ... */ });
  windows.add(window);

  window.on('closed', () => {
    windows.delete(window);
  });

  return window;
}
```

---

## Patrones Comunes

### Desarrollo vs Producción

```javascript
// Detección robusta
const isDev = process.env.NODE_ENV === 'development' ||
              !app.isPackaged ||
              process.argv.includes('--dev');

function createWindow() {
  const mainWindow = new BrowserWindow({ /* ... */ });

  if (isDev) {
    // Desarrollo: Next.js dev server
    mainWindow.loadURL('http://localhost:3000');

    // DevTools
    mainWindow.webContents.openDevTools();

    // Hot reload
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '../node_modules/.bin/electron'),
      hardResetMethod: 'exit'
    });
  } else {
    // Producción: archivos estáticos
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));

    // No DevTools
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }
}
```

### Navegación Segura

```javascript
// Prevenir navegación no autorizada
mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
  const parsedUrl = new URL(navigationUrl);

  // Whitelist de dominios permitidos
  const allowedHosts = ['localhost'];

  if (!allowedHosts.includes(parsedUrl.host)) {
    event.preventDefault();
    console.warn('Navigation blocked to:', navigationUrl);
  }
});

// Prevenir abrir nuevas ventanas
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  // Abrir en navegador externo
  shell.openExternal(url);
  return { action: 'deny' };
});
```

### Deep Links (Custom Protocol)

```javascript
// Registrar protocolo
app.setAsDefaultProtocolClient('domepro');

// Manejar deep links (macOS/Linux)
app.on('open-url', (event, url) => {
  event.preventDefault();

  // domepro://open-project/abc-123
  const parsed = new URL(url);
  const action = parsed.hostname;
  const params = parsed.pathname.slice(1);

  handleDeepLink(action, params);
});

// Windows
if (process.platform === 'win32') {
  const url = process.argv[1];
  if (url && url.startsWith('domepro://')) {
    handleDeepLink(url);
  }
}
```

### Auto-Updater

```javascript
const { autoUpdater } = require('electron-updater');

// Configurar
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Check de updates
autoUpdater.checkForUpdates();

// Eventos
autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update:available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('update:progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Actualización lista',
    message: 'Una nueva versión está lista para instalar',
    buttons: ['Reiniciar', 'Más tarde']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
```

### Tray Icon

```javascript
const { Tray, Menu } = require('electron');

let tray = null;

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Dome');

  // Click en el icono
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}
```

---

## Referencias

### Documentación Oficial
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)
- [contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)

### Artículos y Guías
- [Advanced Electron.js Architecture - LogRocket](https://blog.logrocket.com/advanced-electron-js-architecture/)
- [Electron Desktop App Development Guide 2026 - Medium](https://forasoft.medium.com/electron-desktop-app-development-guide-for-business-in-2026-e75e439fe9d4)
- [Streamlining Electron IPC - Medium](https://medium.com/@ydeshayes/streamlining-electron-ipc-with-scoped-window-managers-fbf1e9636eb2)

### Herramientas de Seguridad
- [Penetration Testing of Electron Apps - DeepStrike](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [secure-electron-template - GitHub](https://github.com/reZach/secure-electron-template)

---

## Checklist de Seguridad

Antes de lanzar a producción, verificar:

- [ ] `contextIsolation: true` en todas las ventanas
- [ ] `nodeIntegration: false` en todas las ventanas
- [ ] `sandbox: true` habilitado
- [ ] Content Security Policy configurada
- [ ] IPC channels validados con whitelist
- [ ] Sender validation en todos los handlers IPC
- [ ] Input sanitization en todas las operaciones de archivos
- [ ] NO exponer APIs peligrosas (fs, child_process, etc.)
- [ ] Navegación restringida a dominios permitidos
- [ ] DevTools deshabilitadas en producción
- [ ] Auto-updater configurado con HTTPS
- [ ] Code signing configurado para la plataforma
- [ ] Permisos mínimos requeridos
- [ ] Error handling que no expone información sensible

---

**Última actualización:** 2026-01-17
