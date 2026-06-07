/* eslint-disable no-console */
/**
 * Update Service - Auto-update via electron-updater
 * Checks for updates on GitHub Releases and notifies renderer
 */

const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

let mainWindow = null;
let broadcastUpdateStatus = () => {};
let beforeQuitCallback = null;

function updaterStatePath() {
  return path.join(app.getPath('userData'), 'updater-state.json');
}

function readUpdaterState() {
  try {
    const raw = fs.readFileSync(updaterStatePath(), 'utf8');
    const data = JSON.parse(raw);
    return typeof data?.skippedVersion === 'string' ? data : {};
  } catch {
    return {};
  }
}

function getSkippedVersion() {
  return readUpdaterState().skippedVersion ?? null;
}

/**
 * Persist a release version to ignore (broken installers, etc.).
 * @param {string} version
 */
function skipVersion(version) {
  if (!version || typeof version !== 'string') return;
  const next = { ...readUpdaterState(), skippedVersion: version };
  fs.mkdirSync(path.dirname(updaterStatePath()), { recursive: true });
  fs.writeFileSync(updaterStatePath(), JSON.stringify(next, null, 2), 'utf8');
  console.log('[Updater] Skipping version until cleared:', version);
}

/**
 * Clear skip (e.g. before installing manually from a fixed release).
 */
function clearSkippedVersion() {
  try {
    const next = { ...readUpdaterState() };
    delete next.skippedVersion;
    fs.writeFileSync(updaterStatePath(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

function isSkipped(info) {
  const v = info?.version;
  if (!v) return false;
  return getSkippedVersion() === v;
}

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
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    if (isSkipped(info)) {
      broadcastUpdateStatus({
        status: 'not-available',
        version: info.version,
        reason: 'skipped-by-user',
      });
      return;
    }
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
async function checkForUpdates() {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return { status: 'skipped', reason: 'development' };
  }
  const result = await autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[Updater] checkForUpdates failed:', err?.message || err);
    return null;
  });
  if (!result) return { isUpdateAvailable: false, message: 'check_failed' };
  const remote = result?.updateInfo?.version;
  if (remote && getSkippedVersion() === remote) {
    return {
      ...result,
      isUpdateAvailable: false,
      skippedByUser: true,
      skippedVersion: remote,
    };
  }
  return result;
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
  clearSkippedVersion();
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  init,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  setBeforeQuitCallback,
  skipVersion,
  clearSkippedVersion,
  getSkippedVersion,
};
