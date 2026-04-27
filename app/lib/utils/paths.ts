import path from 'path';

/**
 * Returns a default user data path based on OS
 */
function getDefaultUserDataPath(): string {
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  const homedir = typeof process !== 'undefined' && process.env.HOME ? process.env.HOME : '';
  
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
  if (typeof window !== 'undefined' && window.electron) {
    console.warn('Sync getUserDataPath called in renderer. Use window.electron.getUserDataPath() (async) instead.');
  }

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

