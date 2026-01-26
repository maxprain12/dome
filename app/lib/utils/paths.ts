import path from 'path';
import os from 'os';

/**
 * Returns a default user data path based on OS
 */
function getDefaultUserDataPath(): string {
  const platform = os.platform();
  const homedir = os.homedir();
  
  switch (platform) {
    case 'darwin':
      return path.join(homedir, 'Library', 'Application Support', 'dome');
    case 'win32':
      return path.join(homedir, 'AppData', 'Roaming', 'dome');
    default:
      return path.join(homedir, '.dome');
  }
}

/**
 * Obtiene la ruta de datos de usuario
 * Funciona tanto en Electron como en modo desarrollo web
 */
export function getUserDataPath(): string {
  // If in Electron renderer process
  if (typeof window !== 'undefined' && window.electron) {
    // We can't make this sync call to window.electron.getUserDataPath() here because it returns a Promise
    // and this function is synchronous.
    // However, for most synchronous needs in renderer, we might need to rely on the passed-down props
    // or use a hook.
    // For now, return default path or throw if strictly needed.
    // Ideally, consumers should use useUserStore or async calls.
    console.warn('Sync getUserDataPath called in renderer. Use window.electron.getUserDataPath() (async) instead.');
    return getDefaultUserDataPath();
  }

  // If in Electron main process (or node)
  if (typeof process !== 'undefined' && process.versions && process.versions.electron && (process as any).type !== 'renderer') {
    try {
      const { app } = require('electron');
      return app.getPath('userData');
    } catch (error) {
      console.warn('Electron app not available, using default path');
      return getDefaultUserDataPath();
    }
  }

  // Web/Development mode without Electron
  return getDefaultUserDataPath();
}

/**
 * Checks if running in Electron
 */
export function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.electron
  );
}

/**
 * Checks if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}
