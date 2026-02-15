/* eslint-disable no-console */

/**
 * Convert OpenAI-format tool definitions to Anthropic format
 * OpenAI: { type: 'function', function: { name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 * @param {Array} tools - OpenAI-format tool definitions
 * @returns {Array} Anthropic-format tool definitions
 */
function convertToolsToAnthropic(tools) {
  if (!tools || !Array.isArray(tools)) return undefined;

  return tools.map(tool => {
    if (tool.type === 'function' && tool.function) {
      return {
        name: tool.function.name,
        description: tool.function.description || '',
        input_schema: tool.function.parameters || { type: 'object', properties: {} },
      };
    }
    // Already in Anthropic format or unknown format
    if (tool.name && tool.input_schema) {
      return tool;
    }
    // Passthrough
    return {
      name: tool.name || 'unknown',
      description: tool.description || '',
      input_schema: tool.parameters || tool.input_schema || { type: 'object', properties: {} },
    };
  });
}

function register({ ipcMain, windowManager, database, aiCloudService, ollamaService }) {
  /**
   * Chat with cloud AI provider (OpenAI, Anthropic, Google)
   * This runs in main process to avoid CORS issues
   */
  ipcMain.handle('ai:chat', async (event, { provider, messages, model }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validate inputs
      if (!provider || !['openai', 'anthropic', 'google'].includes(provider)) {
        throw new Error('Invalid provider. Must be openai, anthropic, or google');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (messages.length > 100) {
        throw new Error('Too many messages. Maximum 100');
      }

      // Get API key from settings
      const queries = database.getQueries();
      const apiKeyResult = queries.getSetting.get('ai_api_key');
      const apiKey = apiKeyResult?.value;

      if (!apiKey) {
        throw new Error(`API key not configured for ${provider}`);
      }

      // Get default model if not provided
      if (!model) {
        const modelResult = queries.getSetting.get('ai_model');
        model = modelResult?.value;
      }

      console.log(`[AI Cloud] Chat - Provider: ${provider}, Model: ${model}`);

      const response = await aiCloudService.chat(provider, messages, apiKey, model);

      return { success: true, content: response };
    } catch (error) {
      console.error('[AI Cloud] Chat error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stream chat with cloud AI provider
   * Uses webContents.send to stream chunks back to renderer
   */
  ipcMain.handle('ai:stream', async (event, { provider, messages, model, streamId, tools }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validate inputs
      if (!provider || !['openai', 'anthropic', 'google', 'ollama'].includes(provider)) {
        throw new Error('Invalid provider. Must be openai, anthropic, google, or ollama');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (!streamId) {
        throw new Error('streamId is required for streaming');
      }

      // ollama: stream locally without API key
      if (provider === 'ollama') {
        try {
          const queries = database.getQueries();
          const baseUrlResult = queries.getSetting.get('ollama_base_url');
          const modelResult = queries.getSetting.get('ollama_model');
          const tempResult = queries.getSetting.get('ollama_temperature');
          const topPResult = queries.getSetting.get('ollama_top_p');
          const numPredictResult = queries.getSetting.get('ollama_num_predict');
          const showThinkingResult = queries.getSetting.get('ollama_show_thinking');
          const baseUrl = baseUrlResult?.value || ollamaService.DEFAULT_BASE_URL;
          const chatModel = model || modelResult?.value || ollamaService.DEFAULT_MODEL;

          // Ollama supports system, user, assistant roles - include system for context (e.g. resource content)
          const ollamaMessages = messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
            content: m.content,
          }));

          const onChunk = (data) => {
            if (event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ai:stream:chunk', { streamId, ...data });
            }
          };

          const opts = {
            temperature: tempResult?.value ? parseFloat(tempResult.value) : 0.7,
            top_p: topPResult?.value ? parseFloat(topPResult.value) : 0.9,
            num_predict: numPredictResult?.value ? parseInt(numPredictResult.value, 10) : 500,
            think: showThinkingResult?.value === 'true',
            tools: tools && tools.length > 0 ? tools : undefined,
          };

          await ollamaService.chatStream(ollamaMessages, chatModel, baseUrl, onChunk, opts);

          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
          }
          return { success: true };
        } catch (err) {
          console.error('[AI] Ollama stream error:', err);
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: err.message });
          }
          return { success: false, error: err.message };
        }
      }

      // Get API key from settings
      const queries = database.getQueries();
      const apiKeyResult = queries.getSetting.get('ai_api_key');
      const apiKey = apiKeyResult?.value;

      if (!apiKey) {
        throw new Error(`API key not configured for ${provider}`);
      }

      // Get default model if not provided
      if (!model) {
        const modelResult = queries.getSetting.get('ai_model');
        model = modelResult?.value;
      }

      console.log(`[AI Cloud] Stream - Provider: ${provider}, Model: ${model}, StreamId: ${streamId}, Tools: ${tools ? tools.length : 0}`);

      // Smart onChunk handler - supports both string (legacy) and object (rich) chunks
      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          if (typeof data === 'string') {
            // Legacy text-only chunk from providers that don't support rich chunks
            event.sender.send('ai:stream:chunk', { streamId, type: 'text', text: data });
          } else if (data && typeof data === 'object') {
            // Rich chunk (text, tool_call, etc.) from enhanced streamAnthropic
            event.sender.send('ai:stream:chunk', { streamId, ...data });
          }
        }
      };

      let fullResponse;
      if (provider === 'anthropic') {
        // Use direct Anthropic API with full tool support
        // Convert OpenAI-format tools to Anthropic format if provided
        const anthropicTools = tools ? convertToolsToAnthropic(tools) : undefined;
        fullResponse = await aiCloudService.streamAnthropic(messages, apiKey, model, onChunk, anthropicTools);
      } else {
        // OpenAI and Google: pass tools to stream (OpenAI format; Google converted in streamGoogle)
        fullResponse = await aiCloudService.stream(provider, messages, apiKey, model, onChunk, tools);
      }

      // Send done signal
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
      }

      return { success: true, content: fullResponse };
    } catch (error) {
      console.error('[AI Cloud] Stream error:', error);
      // Send error to stream
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: error.message });
      }
      return { success: false, error: error.message };
    }
  });

  /**
   * Generate embeddings with cloud AI provider
   */
  ipcMain.handle('ai:embeddings', async (event, { provider, texts, model }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validate inputs
      if (!provider || !['openai', 'google'].includes(provider)) {
        throw new Error('Invalid provider for embeddings. Must be openai or google');
      }
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }
      if (texts.length > 100) {
        throw new Error('Too many texts. Maximum 100');
      }

      // Get API key from settings
      const queries = database.getQueries();
      const apiKeyResult = queries.getSetting.get('ai_api_key');
      const apiKey = apiKeyResult?.value;

      if (!apiKey) {
        throw new Error(`API key not configured for ${provider}`);
      }

      // Get default embedding model if not provided
      if (!model) {
        const modelResult = queries.getSetting.get('ai_embedding_model');
        model = modelResult?.value;
      }

      console.log(`[AI Cloud] Embeddings - Provider: ${provider}, Model: ${model}, Texts: ${texts.length}`);
      const embeddings = await aiCloudService.embeddings(provider, texts, apiKey, model);
      return { success: true, embeddings };
    } catch (error) {
      console.error('[AI Cloud] Embeddings error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Test AI connection by making a minimal API call
   * Returns { success, provider, model } or { success: false, error }
   */
  ipcMain.handle('ai:testConnection', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();

      // Read provider config
      const providerResult = queries.getSetting.get('ai_provider');
      const provider = providerResult?.value;

      if (!provider) {
        return { success: false, error: 'No AI provider configured. Go to Settings > AI to configure one.' };
      }

      // Ollama check
      if (provider === 'ollama') {
        try {
          const baseUrlResult = queries.getSetting.get('ollama_base_url');
          const baseUrl = baseUrlResult?.value || 'http://localhost:11434';
          const urlObj = new URL(`${baseUrl}/api/tags`);
          const http = require('http');
          const available = await new Promise((resolve) => {
            const req = http.get(urlObj.href, { timeout: 5000 }, (res) => {
              resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
          });
          if (available) {
            const modelResult = queries.getSetting.get('ollama_model');
            return { success: true, provider: 'ollama', model: modelResult?.value || 'default' };
          } else {
            return { success: false, error: 'Ollama is not running. Start Ollama first.' };
          }
        } catch (err) {
          return { success: false, error: `Ollama error: ${err.message}` };
        }
      }

      // Cloud providers: openai, anthropic, google
      const modelResult = queries.getSetting.get('ai_model');
      const model = modelResult?.value;

      const apiKeyResult = queries.getSetting.get('ai_api_key');
      const apiKey = apiKeyResult?.value;

      if (!apiKey) {
        return { success: false, error: `API key not configured for ${provider}. Go to Settings > AI.` };
      }

      // Make a minimal test call
      const testMessages = [{ role: 'user', content: 'Reply with OK' }];
      const response = await aiCloudService.chat(provider, testMessages, apiKey, model);

      if (response) {
        return { success: true, provider, model: model || 'default' };
      } else {
        return { success: false, error: 'Connection succeeded but got empty response.' };
      }
    } catch (error) {
      console.error('[AI Cloud] Test connection error:', error);
      return { success: false, error: error.message || 'Unknown error testing connection.' };
    }
  });
}

module.exports = { register };
