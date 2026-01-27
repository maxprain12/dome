const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Window Manager para gestión de múltiples ventanas
 * Basado en las mejores prácticas de Electron 2026
 */
class WindowManager {
  constructor() {
    /**
     * Map de ventanas activas
     * @type {Map<string, BrowserWindow>}
     */
    this.windows = new Map();

    /**
     * Set de IDs de ventanas autorizadas para IPC
     * @type {Set<number>}
     */
    this.authorizedWindows = new Set();

    /**
     * Configuración por defecto para ventanas
     */
    this.defaultConfig = {
      width: 1200,
      height: 800,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
      // macOS specific
      frame: false,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 18, y: 16 },
      transparent: process.platform === 'darwin',
      vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    };
  }

  /**
   * Crear nueva ventana o enfocar existente
   * @param {string} id - ID único de la ventana
   * @param {Electron.BrowserWindowConstructorOptions} options - Opciones adicionales
   * @param {string} route - Ruta a cargar (para Next.js)
   * @returns {BrowserWindow}
   */
  create(id, options = {}, route = '/') {
    // Prevenir duplicados - reutilizar ventana existente
    if (this.windows.has(id)) {
      const existingWindow = this.windows.get(id);
      if (existingWindow && !existingWindow.isDestroyed()) {
        if (existingWindow.isMinimized()) {
          existingWindow.restore();
        }
        existingWindow.focus();
        return existingWindow;
      } else {
        // Limpiar referencia obsoleta
        this.windows.delete(id);
      }
    }

    // Merge configuración por defecto con opciones proporcionadas
    const config = {
      ...this.defaultConfig,
      ...options,
      webPreferences: {
        ...this.defaultConfig.webPreferences,
        ...options.webPreferences,
      },
    };

    // Crear ventana
    const window = new BrowserWindow(config);

    // Tracking
    this.windows.set(id, window);
    // Guardar webContents.id antes de que la ventana pueda ser destruida
    const webContentsId = window.webContents.id;
    this.authorizedWindows.add(webContentsId);

    // Determinar modo (dev o prod)
    const indexPath = path.join(__dirname, '../out/index.html');
    const isDev =
      process.env.NODE_ENV === 'development' ||
      !require('electron').app.isPackaged ||
      !fs.existsSync(indexPath);

    // Logging for debugging production issues
    console.log('[WindowManager] Creating window:', id);
    console.log('[WindowManager] Route:', route);
    console.log('[WindowManager] isDev:', isDev);
    console.log('[WindowManager] app.isPackaged:', require('electron').app.isPackaged);
    console.log('[WindowManager] Index path:', indexPath);
    console.log('[WindowManager] Index exists:', fs.existsSync(indexPath));

    // Cargar contenido
    if (isDev) {
      console.log('[WindowManager] Loading URL: http://localhost:3000' + route);
      window.loadURL(`http://localhost:3000${route}`);
    } else {
      console.log('[WindowManager] Loading file:', indexPath, 'with hash:', route);
      window.loadFile(indexPath, {
        hash: route,
      });
    }

    // Mostrar cuando esté lista (evitar flash blanco)
    window.once('ready-to-show', () => {
      window.show();
    });

    // Cleanup automático
    window.on('closed', () => {
      this.windows.delete(id);
      // Usar el ID guardado en lugar de acceder a window.webContents.id
      // que puede fallar si la ventana ya fue destruida
      this.authorizedWindows.delete(webContentsId);
    });

    // Prevenir navegación no autorizada
    window.webContents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      const allowedHosts = ['localhost', '127.0.0.1'];

      if (!allowedHosts.includes(parsedUrl.hostname)) {
        event.preventDefault();
        console.warn('[WindowManager] Navigation blocked to:', navigationUrl);
      }
    });

    // Prevenir nuevas ventanas - abrir en navegador externo
    window.webContents.setWindowOpenHandler(({ url }) => {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });

    return window;
  }

  /**
   * Obtener ventana por ID
   * @param {string} id
   * @returns {BrowserWindow | undefined}
   */
  get(id) {
    return this.windows.get(id);
  }

  /**
   * Verificar si existe ventana con ID
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    const window = this.windows.get(id);
    return window && !window.isDestroyed();
  }

  /**
   * Cerrar ventana por ID
   * @param {string} id
   */
  close(id) {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  /**
   * Cerrar todas las ventanas
   */
  closeAll() {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
  }

  /**
   * Obtener todas las ventanas
   * @returns {BrowserWindow[]}
   */
  getAll() {
    return Array.from(this.windows.values()).filter((w) => !w.isDestroyed());
  }

  /**
   * Broadcast mensaje a todas las ventanas
   * @param {string} channel - Canal IPC
   * @param {any} data - Datos a enviar
   */
  broadcast(channel, data) {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    }
  }

  /**
   * Enviar mensaje a ventana específica
   * @param {string} id - ID de la ventana
   * @param {string} channel - Canal IPC
   * @param {any} data - Datos a enviar
   * @returns {boolean} - true si se envió, false si no existe ventana
   */
  send(id, channel, data) {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, data);
      return true;
    }
    return false;
  }

  /**
   * Verificar si una ventana está autorizada para IPC
   * @param {number} webContentsId
   * @returns {boolean}
   */
  isAuthorized(webContentsId) {
    return this.authorizedWindows.has(webContentsId);
  }

  /**
   * Obtener número de ventanas activas
   * @returns {number}
   */
  count() {
    return this.getAll().length;
  }

  /**
   * Minimizar todas las ventanas
   */
  minimizeAll() {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed() && !window.isMinimized()) {
        window.minimize();
      }
    }
  }

  /**
   * Restaurar todas las ventanas minimizadas
   */
  restoreAll() {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed() && window.isMinimized()) {
        window.restore();
      }
    }
  }

  /**
   * Obtener ventana enfocada
   * @returns {BrowserWindow | null}
   */
  getFocused() {
    return BrowserWindow.getFocusedWindow();
  }

  /**
   * Crear ventana modal (hijo de otra ventana)
   * @param {string} parentId - ID de la ventana padre
   * @param {string} id - ID de la nueva ventana modal
   * @param {Electron.BrowserWindowConstructorOptions} options
   * @param {string} route
   * @returns {BrowserWindow | null}
   */
  createModal(parentId, id, options = {}, route = '/') {
    const parent = this.windows.get(parentId);
    if (!parent || parent.isDestroyed()) {
      console.error(`[WindowManager] Parent window not found: ${parentId}`);
      return null;
    }

    return this.create(
      id,
      {
        ...options,
        parent,
        modal: true,
        width: options.width || 600,
        height: options.height || 400,
      },
      route
    );
  }
}

// Exportar singleton
module.exports = new WindowManager();
