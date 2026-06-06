'use strict';

const { getAISettings } = require('./ai-settings.cjs');
const { DEFAULT_BASE_URLS, DEFAULT_MODELS } = require('./model-factory.cjs');
const { MINIMAX_ANTHROPIC_BASE_URL } = require('./minimax-config.cjs');

const OPENROUTER_DEFAULT = 'https://openrouter.ai/api/v1';

/** Providers accepted by ai:chat / ai:stream / agent runs. */
const ALL_CHAT_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'dome',
  'ollama',
  'minimax',
  'openrouter',
  'copilot',
  'deepseek',
  'moonshot',
  'qwen',
];

function assertChatProvider(provider) {
  if (!provider || !ALL_CHAT_PROVIDERS.includes(provider)) {
    throw new Error(
      `Invalid provider "${provider}". Must be one of: ${ALL_CHAT_PROVIDERS.join(', ')}`,
    );
  }
}

function readCustomBaseUrl(queries) {
  const raw = queries.getSetting.get('ai_base_url')?.value;
  return raw && String(raw).trim() ? String(raw).trim().replace(/\/$/, '') : undefined;
}

function resolveApiKeyProviderBaseUrl(queries, provider) {
  const custom = readCustomBaseUrl(queries);
  if (custom) return custom;
  if (provider === 'openrouter') return OPENROUTER_DEFAULT;
  if (provider === 'minimax') return MINIMAX_ANTHROPIC_BASE_URL;
  return DEFAULT_BASE_URLS[provider];
}

/**
 * Resolve auth + base URL for a provider (active settings or explicit override).
 *
 * @param {import('../core/database.cjs')} database
 * @param {string} [providerArg]
 * @param {string} [modelArg]
 * @returns {Promise<{ provider: string, apiKey?: string, baseUrl?: string, model?: string }>}
 */
async function resolveProviderConfig(database, providerArg, modelArg) {
  if (!database) {
    throw new Error('Database not initialized. Please restart the app.');
  }

  const settings = await getAISettings(database);
  const provider = providerArg || settings.provider || 'ollama';
  const model = modelArg || settings.model || DEFAULT_MODELS[provider];

  assertChatProvider(provider);

  if (!providerArg || providerArg === settings.provider) {
    if (!settings.apiKey && provider !== 'ollama') {
      throw new Error(`API key not configured for ${provider}`);
    }
    return {
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model,
    };
  }

  const queries = database.getQueries();

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: queries.getSetting.get('ollama_api_key')?.value || undefined,
      baseUrl: queries.getSetting.get('ollama_base_url')?.value || DEFAULT_BASE_URLS.ollama,
      model: model || queries.getSetting.get('ollama_model')?.value || DEFAULT_MODELS.ollama,
    };
  }

  if (provider === 'dome') {
    const domeOauth = require('../auth/dome-oauth.cjs');
    const { getDomeProviderBaseUrl } = require('./dome-provider-url.cjs');
    const session = await domeOauth.getOrRefreshSession(database);
    if (!session?.connected || !session?.accessToken) {
      throw new Error('Dome provider is not connected. Open Settings > AI > Dome and connect your account.');
    }
    return {
      provider,
      apiKey: session.accessToken,
      baseUrl: `${getDomeProviderBaseUrl()}/api/v1`,
      model: model || DEFAULT_MODELS.dome,
    };
  }

  if (provider === 'copilot') {
    const copilotOAuth = require('../auth/github-copilot-oauth.cjs');
    const { token, baseUrl } = await copilotOAuth.getCopilotToken(database);
    if (!token) {
      throw new Error('GitHub Copilot is not connected. Open Settings > AI and connect Copilot.');
    }
    return { provider, apiKey: token, baseUrl, model: model || DEFAULT_MODELS.copilot };
  }

  const apiKey = queries.getSetting.get('ai_api_key')?.value;
  if (!apiKey) throw new Error(`API key not configured for ${provider}`);

  return {
    provider,
    apiKey,
    baseUrl: resolveApiKeyProviderBaseUrl(queries, provider),
    model: model || queries.getSetting.get('ai_model')?.value || DEFAULT_MODELS[provider],
  };
}

module.exports = {
  ALL_CHAT_PROVIDERS,
  assertChatProvider,
  resolveProviderConfig,
};
