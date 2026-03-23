/* eslint-disable no-console */
/**
 * Update Service - Auto-update via electron-updater
 * Checks for updates on GitHub Releases and notifies renderer
 */

const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let broadcastUpdateStatus = () => {};
let beforeQuitCallback = null;

/**
 * Register a callback to run synchronously before quitAndInstall.
 * Used by main.cjs to set isQuitting and destroy the tray before the updater quits.
 * @param {() => void} cb
 */
function setBeforeQuitCallback(cb) {
  beforeQuitCallback = cb;
}

/**
 * Initialize the update service
 * @param {import('electron').BrowserWindow} window - Main window for notifications
 * @param {(status: object) => void} broadcast - Function to send status to renderer
 */
function init(window, broadcast) {
  mainWindow = window;
  broadcastUpdateStatus = broadcast;

  // Skip updates in development
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcastUpdateStatus({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcastUpdateStatus({ status: 'not-available', version: info?.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateStatus({
      status: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateStatus({
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    broadcastUpdateStatus({
      status: 'error',
      error: err.message,
    });
  });

  // Check for updates after a delay (let app stabilize)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] Check failed:', err.message);
      broadcastUpdateStatus({ status: 'error', error: err.message });
    });
  }, 5000);
}

/**
 * Manually check for updates
 */
function checkForUpdates() {
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    return Promise.resolve({ status: 'skipped', reason: 'development' });
  }
  return autoUpdater.checkForUpdates();
}

/**
 * Download the available update
 */
function downloadUpdate() {
  return autoUpdater.downloadUpdate();
}

/**
 * Quit and install the downloaded update.
 * Calls the beforeQuitCallback synchronously first so the tray is destroyed
 * and isQuitting is set before the app exits (critical on macOS).
 */
function quitAndInstall() {
  if (beforeQuitCallback) beforeQuitCallback();
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  init,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  setBeforeQuitCallback,
};
