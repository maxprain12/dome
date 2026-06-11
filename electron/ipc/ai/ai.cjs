/* eslint-disable no-console */

const { setMaxListeners } = require('events');
// Single agent runtime: the "many" surface runs through the Dome-native
// `@dome/agent-core` loop (electron/agents/agent-runtime.cjs).
const agentRuntime = require('../../agents/agent-runtime.cjs');
const llmService = require('../../ai/llm-service.cjs');
const domeOauth = require('../../auth/dome-oauth.cjs');
const { getDomeProviderBaseUrl } = require('../../ai/dome-provider-url.cjs');
const { fetchOpenRouterModels } = require('../../ai/openrouter-models.cjs');
const { fetchProviderModels } = require('../../ai/provider-models.cjs');
const { assertChatProvider, resolveProviderConfig } = require('../../ai/resolve-provider-config.cjs');
const { readSettingSecret, resolveSettingSecretForApi } = require('../../core/settings-secrets.cjs');

/** Abort controllers by streamId for ai:agent:stream (enables renderer to stop stream) */
const agentAbortControllers = new Map();

/** Pending HITL interrupt state keyed by streamId (in-process resume). */
const agentPendingInterrupts = new Map();

/**
 * Double-texting guard: maps sessionId → active streamId.
 * When a new message arrives for the same session, the previous stream is aborted
 * (interrupt strategy — the agent runtime's recommended approach for concurrent user messages).
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
      assertChatProvider(provider);
      if (provider === 'ollama') {
        throw new Error('Ollama chat must use the ollama IPC channel');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (messages.length > 100) {
        throw new Error('Too many messages. Maximum 100');
      }

      const providerConfig = await resolveProviderConfig(database, provider, model);
      const chatModel = providerConfig.model;
      const { apiKey, baseUrl } = providerConfig;

      console.log(`[AI Cloud] Chat - Provider: ${provider}, Model: ${chatModel}`);

      const response = await llmService.chat({
        provider,
        model: chatModel,
        apiKey,
        baseUrl,
        messages,
      });
      const content = typeof response === 'object' && response?.text != null ? response.text : response;

      return { success: true, content, usage: response?.usage ?? null };
    } catch (error) {
      console.error('[AI Cloud] Chat error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stream chat with a provider for plain completions (no tools).
   * Tool-calling is handled exclusively via the agent runtime (ai:agent:stream / runs:start).
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

      assertChatProvider(provider);
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (!streamId) {
        throw new Error('streamId is required for streaming');
      }

      if (provider === 'ollama') {
        try {
          const queries = database.getQueries();
          const baseUrl = queries.getSetting.get('ollama_base_url')?.value || ollamaService.DEFAULT_BASE_URL;
          const chatModel = model || queries.getSetting.get('ollama_model')?.value || ollamaService.DEFAULT_MODEL;
          const tempResult = queries.getSetting.get('ollama_temperature');
          const topPResult = queries.getSetting.get('ollama_top_p');
          const numPredictResult = queries.getSetting.get('ollama_num_predict');
          const ollamaApiKey = readSettingSecret(queries, 'ollama_api_key') || '';

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

      const providerConfig = await resolveProviderConfig(database, provider, model);
      const streamModel = providerConfig.model;
      const { apiKey, baseUrl } = providerConfig;

      console.log(`[AI Cloud] Stream - Provider: ${provider}, Model: ${streamModel}, StreamId: ${streamId}`);

      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          if (typeof data === 'string') {
            event.sender.send('ai:stream:chunk', { streamId, type: 'text', text: data });
          } else if (data && typeof data === 'object') {
            event.sender.send('ai:stream:chunk', { streamId, ...data });
          }
        }
      };

      const fullResponse = await llmService.stream({
        provider,
        model: streamModel,
        apiKey,
        baseUrl,
        messages,
        onChunk,
      });
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
   * Stream chat using agent runtime (alternative to ai:stream for tools)
   * Uses same ai:stream:chunk format for compatibility with existing UI.
   */
  ipcMain.handle('ai:agent:stream', async (event, params) => {
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
      assertChatProvider(provider);
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      if (!streamId) {
        throw new Error('streamId is required for streaming');
      }

      const providerConfig = await resolveProviderConfig(database, provider, model);
      const chatModel = providerConfig.model;
      const { apiKey, baseUrl } = providerConfig;

      const controller = new AbortController();
      setMaxListeners(64, controller.signal);
      agentAbortControllers.set(streamId, controller);

      // Double-texting guard: abort previous stream for the same session (interrupt strategy)
      if (sessionId) {
        const prevStreamId = sessionActiveStream.get(sessionId);
        if (prevStreamId && prevStreamId !== streamId) {
          const prevCtrl = agentAbortControllers.get(prevStreamId);
          if (prevCtrl) prevCtrl.abort();
          agentAbortControllers.delete(prevStreamId);
        }
        sessionActiveStream.set(sessionId, streamId);
      }

      const onChunk = (data) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ai:stream:chunk', { streamId, ...data });
        }
      };

      try {
        const result = await agentRuntime.runManyAgent({
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
          sessionId,
          skipHitl,
          hitlInterrupt: !skipHitl,
          requiresApproval: skipHitl ? null : agentRuntime.HITL_TOOL_NAMES,
        });
        if (result && typeof result === 'object' && result.__interrupt__) {
          agentPendingInterrupts.set(streamId, {
            threadId: result.threadId,
            pendingApproval: {
              actionRequests: result.actionRequests,
              reviewConfigs: result.reviewConfigs,
              pendingToolCall: result.pendingToolCall ?? null,
            },
            provider,
            model: chatModel,
            apiKey,
            baseUrl,
            messages,
            tools,
            mcpServerIds,
            subagentIds,
            sessionId,
          });
          return { success: true, interrupted: true, threadId: result.threadId };
        }
        agentPendingInterrupts.delete(streamId);
        return { success: true };
      } finally {
        agentAbortControllers.delete(streamId);
        if (sessionId && sessionActiveStream.get(sessionId) === streamId) {
          sessionActiveStream.delete(sessionId);
        }
      }
    } catch (error) {
      console.error('[AI Agent] Stream error:', error);
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
      agentAbortControllers.delete(streamId);
      if (sessionId && sessionActiveStream.get(sessionId) === streamId) {
        sessionActiveStream.delete(sessionId);
      }
      return { success: isAbort, error: isAbort ? undefined : error?.message };
    }
  });

  ipcMain.handle('ai:agent:abort', async (event, streamId) => {
    try {
      if (!windowManager.isAuthorized(event.sender.id)) {
        return { success: false, error: 'Unauthorized' };
      }
      const controller = agentAbortControllers.get(streamId);
      if (controller) controller.abort();
      return { success: true };
    } catch (error) {
      console.error('[AI] the agent runtime abort error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:agent:resume', async (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!params || typeof params !== 'object') {
      return { success: false, error: 'Invalid params' };
    }
    const { streamId, threadId: rawThreadId, decisions, provider: rawProvider, model: rawModel } = params;
    if (!streamId) {
      return { success: false, error: 'streamId is required' };
    }
    const pending = agentPendingInterrupts.get(streamId);
    const threadId = rawThreadId || pending?.threadId;
    if (!threadId) {
      return { success: false, error: 'No threadId for resume' };
    }

    const onChunk = (data) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ai:stream:chunk', { streamId, ...data });
      }
    };

    const controller = new AbortController();
    setMaxListeners(64, controller.signal);
    agentAbortControllers.set(streamId, controller);

    try {
      const providerConfig = await resolveProviderConfig(
        database,
        rawProvider || pending?.provider,
        rawModel || pending?.model,
      );
      const result = await agentRuntime.resumeDomeAgent('many', {
        threadId,
        decisions: Array.isArray(decisions) ? decisions : [],
        pendingApproval: pending?.pendingApproval ?? {},
        pendingToolCall: pending?.pendingApproval?.pendingToolCall ?? null,
        provider: providerConfig.provider,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        messages: pending?.messages,
        toolDefinitions: pending?.tools,
        mcpServerIds: pending?.mcpServerIds,
        signal: controller.signal,
        onChunk,
      });

      if (result && typeof result === 'object' && result.__interrupt__) {
        agentPendingInterrupts.set(streamId, {
          ...(pending || {}),
          threadId: result.threadId,
          pendingApproval: {
            actionRequests: result.actionRequests,
            reviewConfigs: result.reviewConfigs,
            pendingToolCall: result.pendingToolCall ?? null,
          },
        });
        return { success: true, interrupted: true, threadId: result.threadId };
      }

      agentPendingInterrupts.delete(streamId);
      onChunk({ type: 'done' });
      return { success: true };
    } catch (error) {
      console.error('[AI Agent] Resume error:', error);
      const userMessage = error?.message || 'Resume failed';
      onChunk({ type: 'error', error: userMessage });
      return { success: false, error: userMessage };
    } finally {
      agentAbortControllers.delete(streamId);
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

      if (provider === 'copilot') {
        try {
          const copilotOAuth = require('../../auth/github-copilot-oauth.cjs');
          const { token, baseUrl } = await copilotOAuth.getCopilotToken(database);
          if (!token) {
            return { success: false, error: 'GitHub Copilot is not connected. Go to Settings > AI.' };
          }
          const testMessages = [{ role: 'user', content: 'Reply with OK' }];
          const response = await llmService.chat({
            provider: 'copilot',
            model: model || 'gpt-4.1',
            apiKey: token,
            baseUrl,
            messages: testMessages,
          });
          const text = typeof response === 'object' && response?.text != null ? response.text : response;
          if (text) {
            return { success: true, provider: 'copilot', model: model || 'gpt-4.1' };
          }
          return { success: false, error: 'Connection succeeded but got empty response.' };
        } catch (err) {
          return { success: false, error: err.message || 'Error testing GitHub Copilot connection.' };
        }
      }

      const providerConfig = await resolveProviderConfig(database, provider, model);
      if (!providerConfig.apiKey) {
        return { success: false, error: `API key not configured for ${provider}. Go to Settings > AI.` };
      }
      const testMessages = [{ role: 'user', content: 'Reply with OK' }];
      const response = await llmService.chat({
        provider,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        messages: testMessages,
      });
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
      const queries = database.getQueries();
      const candidate = params && typeof params === 'object' && typeof params.apiKey === 'string'
        ? params.apiKey
        : '';
      const apiKey = resolveSettingSecretForApi(queries, 'ai_api_key', candidate);
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
      const queries = database.getQueries();
      const candidate = typeof params.apiKey === 'string' ? params.apiKey : '';
      const apiKey = provider === 'dome'
        ? ''
        : resolveSettingSecretForApi(queries, 'ai_api_key', candidate);
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
