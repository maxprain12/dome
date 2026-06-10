/* eslint-disable no-console */
const { readSettingSecret } = require('../../core/settings-secrets.cjs');

function register({ ipcMain, windowManager, database, ollamaService, getOllamaManager }) {
  function ensureEmbeddedOllama() {
    const win = windowManager.get?.('main');
    const mgr = getOllamaManager();
    mgr.ensureInitialized(win && !win.isDestroyed() ? win : null);
    return mgr;
  }
  /**
   * Check if Ollama is available
   */
  ipcMain.handle('ollama:check-availability', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
      const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
      const apiKey = readSettingSecret(database.getQueries(), 'ollama_api_key') || '';
      const isAvailable = await ollamaService.checkAvailability(baseUrl, apiKey);
      return { success: true, available: isAvailable };
    } catch (error) {
      console.error('[Ollama] Error checking availability:', error);
      return { success: false, error: error.message, available: false };
    }
  });

  /**
   * List available models from Ollama
   */
  ipcMain.handle('ollama:list-models', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
      const apiKey = readSettingSecret(database.getQueries(), 'ollama_api_key') || '';
      const models = await ollamaService.listModels(baseUrl, apiKey);
      return { success: true, models };
    } catch (error) {
      console.error('[Ollama] Error listing models:', error);
      return { success: false, error: error.message, models: [] };
    }
  });

  /**
   * Generate embedding with Ollama
   */
  ipcMain.handle('ollama:generate-embedding', async (event, text) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar text
      if (typeof text !== 'string') {
        throw new Error('Text must be a string');
      }
      if (text.length === 0) {
        throw new Error('Text cannot be empty');
      }
      if (text.length > 100000) {
        throw new Error('Text too long. Maximum 100000 characters');
      }
      const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
      const embeddingModelResult = database.getQueries().getSetting.get('ollama_embedding_model');

      const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
      const model = embeddingModelResult?.value || ollamaService.DEFAULT_EMBEDDING_MODEL;
      const apiKey = readSettingSecret(database.getQueries(), 'ollama_api_key') || '';

      const embedding = await ollamaService.generateEmbedding(text, model, baseUrl, apiKey);
      return { success: true, embedding };
    } catch (error) {
      console.error('[Ollama] Error generating embedding:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Generate summary with Ollama
   */
  ipcMain.handle('ollama:generate-summary', async (event, text) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar text
      if (typeof text !== 'string') {
        throw new Error('Text must be a string');
      }
      if (text.length === 0) {
        throw new Error('Text cannot be empty');
      }
      if (text.length > 500000) {
        throw new Error('Text too long. Maximum 500000 characters');
      }
      const baseUrlResult = database.getQueries().getSetting.get('ollama_base_url');
      const modelResult = database.getQueries().getSetting.get('ollama_model');

      const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
      const model = modelResult?.value || ollamaService.DEFAULT_MODEL;
      const apiKey = readSettingSecret(database.getQueries(), 'ollama_api_key') || '';

      const summary = await ollamaService.generateSummary(text, model, baseUrl, apiKey);
      return { success: true, summary };
    } catch (error) {
      console.error('[Ollama] Error generating summary:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Chat with Ollama
   */
  ipcMain.handle('ollama:chat', async (event, { messages, model }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validar messages
      if (!Array.isArray(messages)) {
        throw new Error('Messages must be an array');
      }
      if (messages.length === 0) {
        throw new Error('Messages array cannot be empty');
      }
      if (messages.length > 100) {
        throw new Error('Too many messages. Maximum 100 messages');
      }
      // Validar estructura de cada mensaje
      for (const msg of messages) {
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
          throw new Error('Each message must be an object');
        }
        if (typeof msg.role !== 'string' || !['system', 'user', 'assistant'].includes(msg.role)) {
          throw new Error('Message role must be "system", "user", or "assistant"');
        }
        if (typeof msg.content !== 'string') {
          throw new Error('Message content must be a string');
        }
        if (msg.content.length > 100000) {
          throw new Error('Message content too long. Maximum 100000 characters per message');
        }
      }
      // Validar model si se proporciona
      if (model !== undefined && (typeof model !== 'string' || model.length > 200)) {
        throw new Error('Model must be a string with max 200 characters');
      }
      const queries = database.getQueries();
      const baseUrlResult = queries.getSetting.get('ollama_base_url');
      const modelResult = queries.getSetting.get('ollama_model');

      const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
      const chatModel = model || modelResult?.value || ollamaService.DEFAULT_MODEL;
      const apiKey = readSettingSecret(queries, 'ollama_api_key') || '';

      console.log(`[Ollama] Chat config - Base URL: ${baseUrl}, Model from param: ${model}, Model from DB: ${modelResult?.value}, Using: ${chatModel}`);

      // Convertir mensajes del formato API al formato Ollama
      // Ollama espera mensajes sin el system prompt como mensaje separado
      const ollamaMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }));

      const response = await ollamaService.chat(ollamaMessages, chatModel, baseUrl, apiKey);

      return { success: true, content: response };
    } catch (error) {
      console.error('[Ollama] Error in chat:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // OLLAMA MANAGER IPC HANDLERS (Native Integration)
  // ============================================

  /**
   * Start Ollama server (downloads if needed)
   */
  ipcMain.handle('ollama:manager:start', async (event, version) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const mgr = ensureEmbeddedOllama();
      const result = await mgr.ensureRunning(version || 'latest');
      return result;
    } catch (error) {
      console.error('[OllamaManager] Error starting:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stop Ollama server
   */
  ipcMain.handle('ollama:manager:stop', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const mgr = ensureEmbeddedOllama();
      const result = await mgr.stop();
      return result;
    } catch (error) {
      console.error('[OllamaManager] Error stopping:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get Ollama manager status
   */
  ipcMain.handle('ollama:manager:status', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const mgr = ensureEmbeddedOllama();
      const status = mgr.getStatus();
      const isRunning = await mgr.isRunning();
      return {
        success: true,
        ...status,
        isRunning
      };
    } catch (error) {
      console.error('[OllamaManager] Error getting status:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Download Ollama version without starting
   */
  ipcMain.handle('ollama:manager:download', async (event, version) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const mgr = ensureEmbeddedOllama();
      const result = await mgr.download(version || 'latest');
      return result;
    } catch (error) {
      console.error('[OllamaManager] Error downloading:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get list of downloaded versions
   */
  ipcMain.handle('ollama:manager:versions', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const mgr = ensureEmbeddedOllama();
      const versions = mgr.getDownloadedVersions();
      return { success: true, versions };
    } catch (error) {
      console.error('[OllamaManager] Error getting versions:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
