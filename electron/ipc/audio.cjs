/* eslint-disable no-console */
const path = require('path');
const { app } = require('electron');
const audioPlayback = require('../audio-playback.cjs');
const streamingTts = require('../streaming-tts.cjs');
const { getOpenAIKey } = require('../openai-key.cjs');

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

/**
 * Audio IPC Handlers
 *
 * Handles IPC communication for audio generation (TTS).
 * Routes requests from the renderer to the TTS service
 * running in the main process.
 */

function register({ ipcMain, windowManager, database, ttsService }) {
  /**
   * Generate speech from a single text input
   */
  ipcMain.handle('audio:generate-speech', async (event, { text, voice, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const apiKey = getOpenAIKey(database);
      if (!apiKey) {
        return { success: false, error: 'OpenAI API key not configured. Please add it in Settings.' };
      }

      const result = await ttsService.generateSpeech(text, voice || 'nova', apiKey, options || {});
      return result;
    } catch (error) {
      console.error('[Audio IPC] generate-speech error:', error);
      return { success: false, error: error.message };
    }
  });

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

  /**
   * Generate a full podcast from dialogue lines
   */
  ipcMain.handle('audio:generate-podcast', async (event, { lines, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const apiKey = getOpenAIKey(database);
      if (!apiKey) {
        return { success: false, error: 'OpenAI API key not configured. Please add it in Settings.' };
      }

      // Send progress updates to renderer
      const progressOptions = {
        ...options,
        onProgress: (current, total) => {
          try {
            event.sender.send('audio:generation-progress', { current, total });
          } catch {
            // Sender may have been destroyed
          }
        },
      };

      const result = await ttsService.generatePodcast(lines, apiKey, progressOptions);
      return result;
    } catch (error) {
      console.error('[Audio IPC] generate-podcast error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Check generation status
   */
  ipcMain.handle('audio:get-status', async (event, { generationId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const status = ttsService.getStatus(generationId);
      return { success: true, data: status };
    } catch (error) {
      console.error('[Audio IPC] get-status error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List generated audio files
   */
  ipcMain.handle('audio:list', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const files = ttsService.listAudioFiles();
      return { success: true, data: files };
    } catch (error) {
      console.error('[Audio IPC] list error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stop / cancel streaming TTS for a run (e.g. user interrupts)
   */
  ipcMain.handle('audio:stop-streaming-tts', async (event, { runId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (runId) {
      streamingTts.cancel(runId);
    }
    return { success: true };
  });
}

module.exports = { register };
