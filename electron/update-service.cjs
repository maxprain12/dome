/* eslint-disable no-console */
/**
 * Update Service - Auto-update via electron-updater
 * Checks for updates on GitHub Releases and notifies renderer
 */

const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let broadcastUpdateStatus = () => {};

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
    console.log('[Updater] Skipping - development or unpackaged');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    broadcastUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    broadcastUpdateStatus({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] No update available. Current:', info?.version || 'unknown');
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
    console.log('[Updater] Update downloaded:', info.version);
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
 * Quit and install the downloaded update
 */
function quitAndInstall() {
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  init,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
};
