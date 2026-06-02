/* eslint-disable no-console */

const { setMaxListeners } = require('events');
const langgraphAgent = require('../langgraph-agent.cjs');
const llmService = require('../llm-service.cjs');
const domeOauth = require('../dome-oauth.cjs');
const { getDomeProviderBaseUrl } = require('../dome-provider-url.cjs');
const { fetchOpenRouterModels } = require('../openrouter-models.cjs');
const { fetchProviderModels } = require('../provider-models.cjs');

/** Abort controllers by streamId for ai:langgraph:stream (enables renderer to stop stream) */
const langGraphAbortControllers = new Map();

/**
 * Double-texting guard: maps sessionId → active streamId.
 * When a new message arrives for the same session, the previous stream is aborted
 * (interrupt strategy — LangGraph's recommended approach for concurrent user messages).
 */
const sessionActiveStream = new Map();

function register({ ipcMain, windowManager, database, ollamaService }) {
  /**
   * Chat with cloud AI provider (OpenAI, Anthropic, Google)
   * This runs in main process to avoid CORS issues
   */
  ipcMain.handle('ai:chat', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    let provider;
    let messages;
    let model;

    if (!params || typeof params !== 'object') {
      return { success: false, error: 'Invalid params' };
    }
    ({ provider, messages, model } = params);

    try {
      // Validate inputs
      if (!provider || !['openai', 'anthropic', 'google', 'dome', 'minimax', 'openrouter'].includes(provider)) {
        throw new Error('Invalid provider. Must be openai, anthropic, google, dome, minimax, or openrouter');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (messages.length > 100) {
        throw new Error('Too many messages. Maximum 100');
      }

      if (provider === 'dome') {
        const response = await domeOauth.fetchWithDomeAuth(database, `${getDomeProviderBaseUrl()}/api/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'dome/auto',
            messages,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Dome provider request failed (${response.status}): ${text}`);
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Dome provider returned empty response');
        return { success: true, content };
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

      const response = await llmService.chat({ provider, model, apiKey, messages });
      const content = typeof response === 'object' && response?.text != null ? response.text : response;

      return { success: true, content, usage: response?.usage ?? null };
    } catch (error) {
      console.error('[AI Cloud] Chat error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stream chat with a provider for plain completions (no tools).
   * Tool-calling is handled exclusively via LangGraph (ai:langgraph:stream / runs:startLangGraph).
   */
  ipcMain.handle('ai:stream', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!params || typeof params !== 'object') {
      return { success: false, error: 'Invalid params' };
    }

    try {
      const { provider, messages, streamId } = params;
      let { model } = params;

      if (!provider || !['openai', 'anthropic', 'google', 'dome', 'ollama', 'minimax', 'openrouter'].includes(provider)) {
        throw new Error('Invalid provider. Must be openai, anthropic, google, dome, ollama, minimax, or openrouter');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (!streamId) {
        throw new Error('streamId is required for streaming');
      }

      if (provider === 'dome') {
        const response = await domeOauth.fetchWithDomeAuth(database, `${getDomeProviderBaseUrl()}/api/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'dome/auto',
            messages,
            stream: true,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Dome provider request failed (${response.status}): ${text}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') {
              if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
              }
              return { success: true, content: fullContent };
            }
            try {
              const parsed = JSON.parse(raw);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content && event.sender && !event.sender.isDestroyed()) {
                fullContent += delta.content;
                event.sender.send('ai:stream:chunk', { streamId, type: 'text', text: delta.content });
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }

        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
        }
        return { success: true, content: fullContent };
      }

      if (provider === 'ollama') {
        try {
          const queries = database.getQueries();
          const baseUrl = queries.getSetting.get('ollama_base_url')?.value || ollamaService.DEFAULT_BASE_URL;
          const chatModel = model || queries.getSetting.get('ollama_model')?.value || ollamaService.DEFAULT_MODEL;
          const tempResult = queries.getSetting.get('ollama_temperature');
          const topPResult = queries.getSetting.get('ollama_top_p');
          const numPredictResult = queries.getSetting.get('ollama_num_predict');
          const ollamaApiKey = queries.getSetting.get('ollama_api_key')?.value || '';

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
            num_predict: numPredictResult?.value ? parseInt(numPredictResult.value, 10) : 4000,
            think: true,
            apiKey: ollamaApiKey || undefined,
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

      const queries = database.getQueries();
      const apiKey = queries.getSetting.get('ai_api_key')?.value;
      if (!apiKey) throw new Error(`API key not configured for ${provider}`);
      if (!model) model = queries.getSetting.get('ai_model')?.value;

      console.log(`[AI Cloud] Stream - Provider: ${provider}, Model: ${model}, StreamId: ${streamId}`);

      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          if (typeof data === 'string') {
            event.sender.send('ai:stream:chunk', { streamId, type: 'text', text: data });
          } else if (data && typeof data === 'object') {
            event.sender.send('ai:stream:chunk', { streamId, ...data });
          }
        }
      };

      const fullResponse = await llmService.stream({ provider, model, apiKey, messages, onChunk });
      const content =
        typeof fullResponse === 'object' && fullResponse?.text != null ? fullResponse.text : fullResponse;

      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'done', usage: fullResponse?.usage ?? null });
      }

      return { success: true, content, usage: fullResponse?.usage ?? null };
    } catch (error) {
      console.error('[AI Cloud] Stream error:', error);
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: error.message });
      }
      return { success: false, error: error.message };
    }
  });

  /**
   * Stream chat using LangGraph agent (alternative to ai:stream for tools)
   * Uses same ai:stream:chunk format for compatibility with existing UI.
   */
  ipcMain.handle('ai:langgraph:stream', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    let provider;
    let messages;
    let model;
    let streamId;
    let tools;
    let threadId;
    let skipHitl;
    let mcpServerIds;
    let subagentIds;
    let sessionId;

    if (!params || typeof params !== 'object') {
      return { success: false, error: 'Invalid params' };
    }
    ({
      provider,
      messages,
      model,
      streamId,
      tools,
      threadId,
      skipHitl,
      mcpServerIds,
      subagentIds,
      sessionId,
    } = params);

    try {
      if (!provider || !['openai', 'anthropic', 'google', 'ollama', 'minimax', 'openrouter'].includes(provider)) {
        throw new Error('Invalid provider for LangGraph. Must be openai, anthropic, google, ollama, minimax, or openrouter');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (!streamId) {
        throw new Error('streamId is required for streaming');
      }

      const queries = database.getQueries();
      let apiKey;
      let baseUrl;

      let chatModel;
      if (provider === 'ollama') {
        baseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434';
        chatModel = model || queries.getSetting.get('ollama_model')?.value || 'llama3.2';
        apiKey = queries.getSetting.get('ollama_api_key')?.value || undefined;
      } else if (provider === 'dome') {
        // Dome uses OAuth — not a static API key. Get the current access token.
        const session = await domeOauth.getOrRefreshSession(database);
        if (!session?.connected || !session?.accessToken) {
          throw new Error('Dome session not found. Please sign in to Dome in Settings.');
        }
        apiKey = session.accessToken;
        // ChatOpenAI appends /chat/completions to baseURL, so point to /api/v1.
        baseUrl = `${getDomeProviderBaseUrl()}/api/v1`;
        chatModel = model || 'dome/auto';
      } else {
        apiKey = queries.getSetting.get('ai_api_key')?.value;
        if (!apiKey) throw new Error(`API key not configured for ${provider}`);
        chatModel = model || queries.getSetting.get('ai_model')?.value;
      }

      const controller = new AbortController();
      setMaxListeners(64, controller.signal);
      langGraphAbortControllers.set(streamId, controller);

      // Double-texting guard: abort previous stream for the same session (interrupt strategy)
      if (sessionId) {
        const prevStreamId = sessionActiveStream.get(sessionId);
        if (prevStreamId && prevStreamId !== streamId) {
          const prevCtrl = langGraphAbortControllers.get(prevStreamId);
          if (prevCtrl) prevCtrl.abort();
          langGraphAbortControllers.delete(prevStreamId);
        }
        sessionActiveStream.set(sessionId, streamId);
      }

      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ai:stream:chunk', { streamId, ...data });
        }
      };

      try {
        const result = await langgraphAgent.invokeLangGraphAgent({
          provider,
          model: chatModel,
          apiKey,
          baseUrl,
          messages,
          toolDefinitions: tools,
          useDirectTools: (tools && tools.length > 0) || (mcpServerIds && mcpServerIds.length > 0),
          mcpServerIds: mcpServerIds && mcpServerIds.length > 0 ? mcpServerIds : undefined,
          subagentIds: Array.isArray(subagentIds) ? subagentIds : undefined,
          onChunk,
          signal: controller.signal,
          threadId,
          skipHitl,
          senderWebContentsId: event.sender.id,
        });
        if (result && typeof result === 'object' && result.__interrupt__) {
          return { success: true, interrupted: true, threadId: result.threadId };
        }
        return { success: true };
      } finally {
        langGraphAbortControllers.delete(streamId);
        if (sessionId && sessionActiveStream.get(sessionId) === streamId) {
          sessionActiveStream.delete(sessionId);
        }
      }
    } catch (error) {
      console.error('[AI LangGraph] Stream error:', error);
      const isAbort = error?.name === 'AbortError' || error?.message?.includes('abort');
      if (isAbort && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'done' });
      } else {
        let userMessage = error?.message || 'Unknown error';
        const statusCode = error?.status_code ?? error?.statusCode;
        if (statusCode === 500 || userMessage.includes('500')) {
          userMessage =
            'Ollama returned an error (500). Try: 1) Ensure Ollama is running 2) Try another model (e.g. llama3.2) 3) For glm-5:cloud, sign in to the Ollama app (Settings → Sign in)';
        }
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: userMessage });
        }
      }
      langGraphAbortControllers.delete(streamId);
      if (sessionId && sessionActiveStream.get(sessionId) === streamId) {
        sessionActiveStream.delete(sessionId);
      }
      return { success: isAbort, error: isAbort ? undefined : error?.message };
    }
  });

  ipcMain.handle('ai:langgraph:abort', async (event, streamId) => {
    try {
      if (!windowManager.isAuthorized(event.sender.id)) {
        return { success: false, error: 'Unauthorized' };
      }
      const controller = langGraphAbortControllers.get(streamId);
      if (controller) controller.abort();
      return { success: true };
    } catch (error) {
      console.error('[AI] LangGraph abort error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:langgraph:resume', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    let threadId;
    let streamId;
    let decisions;
    let provider;
    let model;

    if (!params || typeof params !== 'object') {
      return { success: false, error: 'Invalid params' };
    }
    ({ threadId, streamId, decisions, provider: providerArg, model: modelArg } = params);

    try {
      if (!threadId || !streamId || !Array.isArray(decisions)) {
        throw new Error('threadId, streamId, and decisions are required');
      }

      const queries = database.getQueries();
      const provider = providerArg || queries.getSetting.get('ai_provider')?.value || 'ollama';
      let apiKey;
      let baseUrl;
      let chatModel;
      if (provider === 'ollama') {
        baseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434';
        chatModel = modelArg || queries.getSetting.get('ollama_model')?.value || 'llama3.2';
        apiKey = queries.getSetting.get('ollama_api_key')?.value || undefined;
      } else {
        apiKey = queries.getSetting.get('ai_api_key')?.value;
        if (!apiKey) throw new Error(`API key not configured for ${provider}`);
        chatModel = modelArg || queries.getSetting.get('ai_model')?.value;
      }

      const controller = new AbortController();
      setMaxListeners(64, controller.signal);
      langGraphAbortControllers.set(streamId, controller);

      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ai:stream:chunk', { streamId, ...data });
        }
      };

      try {
        const result = await langgraphAgent.resumeLangGraphAgent({
          provider,
          model: chatModel,
          apiKey,
          baseUrl,
          messages: [],
          onChunk,
          signal: controller.signal,
          threadId,
          decisions,
        });
        if (result && typeof result === 'object' && result.__interrupt__) {
          return { success: true, interrupted: true, threadId: result.threadId };
        }
        return { success: true };
      } finally {
        langGraphAbortControllers.delete(streamId);
      }
    } catch (error) {
      console.error('[AI LangGraph] Resume error:', error);
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, type: 'error', error: error?.message || String(error) });
      }
      return { success: false, error: error?.message };
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
          const transport = urlObj.protocol === 'https:' ? require('https') : require('http');
          const available = await new Promise((resolve) => {
            const req = transport.get(urlObj.href, { timeout: 5000, rejectUnauthorized: false }, (res) => {
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

      // Cloud providers: openai, anthropic, google, dome
      const modelResult = queries.getSetting.get('ai_model');
      const model = modelResult?.value;

      if (provider === 'dome') {
        try {
          const quotaResponse = await domeOauth.fetchWithDomeAuth(database, `${getDomeProviderBaseUrl()}/api/v1/me/quota`);
          if (!quotaResponse.ok) {
            const text = await quotaResponse.text();
            return { success: false, error: `Dome provider no disponible: ${text}` };
          }
          return { success: true, provider: 'dome', model: model || 'dome/auto' };
        } catch (err) {
          return { success: false, error: err.message || `Error conectando Dome provider: ${err.message}` };
        }
      }

      const apiKeyResult = queries.getSetting.get('ai_api_key');
      const apiKey = apiKeyResult?.value;

      if (!apiKey) {
        return { success: false, error: `API key not configured for ${provider}. Go to Settings > AI.` };
      }

      // Make a minimal test call
      const testMessages = [{ role: 'user', content: 'Reply with OK' }];
      const response = await llmService.chat({ provider, model, apiKey, messages: testMessages });
      const text = typeof response === 'object' && response?.text != null ? response.text : response;

      if (text) {
        return { success: true, provider, model: model || 'default' };
      } else {
        return { success: false, error: 'Connection succeeded but got empty response.' };
      }
    } catch (error) {
      console.error('[AI Cloud] Test connection error:', error);
      return { success: false, error: error.message || 'Unknown error testing connection.' };
    }
  });

  ipcMain.handle('ai:openrouter:listModels', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      let apiKey = '';
      if (params && typeof params === 'object' && typeof params.apiKey === 'string') {
        apiKey = params.apiKey.trim();
      }
      if (!apiKey) {
        const queries = database.getQueries();
        apiKey = String(queries.getSetting.get('ai_api_key')?.value || '').trim();
      }
      return await fetchOpenRouterModels(apiKey);
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('ai:provider:listModels', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (!params || typeof params !== 'object' || typeof params.provider !== 'string') {
        return { success: false, error: 'Invalid params: provider required' };
      }
      const provider = params.provider.trim().toLowerCase();
      let apiKey = typeof params.apiKey === 'string' ? params.apiKey.trim() : '';
      if (!apiKey && provider !== 'dome') {
        const queries = database.getQueries();
        apiKey = String(queries.getSetting.get('ai_api_key')?.value || '').trim();
      }
      return await fetchProviderModels(provider, { apiKey });
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('ai:testWebSearch', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return await aiToolsHandler.testWebSearchConnection();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('ai:webSearch', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { status: 'error', error: 'Unauthorized' };
    }

    try {
      return await aiToolsHandler.webSearch(args);
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

module.exports = { register };
