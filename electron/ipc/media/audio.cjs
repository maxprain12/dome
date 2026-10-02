/* eslint-disable no-console */
const path = require('node:path');
const { app } = require('electron');
const audioPlayback = require('../../speech/audio-playback.cjs');

/**
 * @param {string} filePath
 * @param {string} audioDir Resolved absolute audio root
 */
function _isPathInsideAudioDir(filePath, audioDir) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(audioDir);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved === root || resolved.startsWith(prefix);
}

/** Play existing audio files. */

function register({ ipcMain, windowManager }) {

  ipcMain.handle('audio:play-file', async (event, { filePath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid path' };
      }
      const audioDir = path.join(app.getPath('userData'), 'audio');
      if (!_isPathInsideAudioDir(filePath, audioDir)) {
        return { success: false, error: 'Invalid audio path' };
      }
      const resolved = path.resolve(filePath);
      await audioPlayback.playAudioFile(resolved);
      return { success: true };
    } catch (error) {
      const msg =
        error instanceof Error && typeof error.message === 'string' && error.message.trim()
          ? error.message.trim()
          : typeof error === 'string' && error.trim()
            ? error.trim()
            : (() => {
                try {
                  return JSON.stringify(error);
                } catch {
                  return 'Error desconocido al reproducir audio';
                }
              })();
      console.error('[Audio IPC] play-file failed:', msg, error);
      return { success: false, error: msg };
    }
  });
}

module.exports = { register };
