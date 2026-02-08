/* eslint-disable no-console */
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
      // Get OpenAI API key from settings
      const apiKey = _getOpenAIKey(database);
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

  /**
   * Generate a full podcast from dialogue lines
   */
  ipcMain.handle('audio:generate-podcast', async (event, { lines, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Get OpenAI API key from settings
      const apiKey = _getOpenAIKey(database);
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
}

/**
 * Get OpenAI API key from database settings
 * @private
 * @param {Object} database - Database module
 * @returns {string|null}
 */
function _getOpenAIKey(database) {
  try {
    const queries = database.getQueries();

    // First try direct OpenAI key
    const openaiKey = queries.getSetting.get('ai.api_key');
    if (openaiKey?.value) {
      return openaiKey.value;
    }

    // Try the provider-specific approach: check if provider is openai
    const provider = queries.getSetting.get('ai.provider');
    if (provider?.value === 'openai') {
      const key = queries.getSetting.get('ai.api_key');
      if (key?.value) return key.value;
    }

    // Try openai-specific setting key
    const openaiSpecific = queries.getSetting.get('openai_api_key');
    if (openaiSpecific?.value) {
      return openaiSpecific.value;
    }

    return null;
  } catch (error) {
    console.error('[Audio IPC] Error getting OpenAI key:', error);
    return null;
  }
}

module.exports = { register };
