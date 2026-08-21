'use strict';

const { getDomeProviderBaseUrl } = require('./dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const { DEFAULT_BASE_URLS, DEFAULT_MODELS } = require('./model-factory.cjs');
const { readSettingSecret } = require('../core/settings-secrets.cjs');
const { readProviderApiKey, readProviderBaseUrl } = require('./provider-keys.cjs');
const { MINIMAX_ANTHROPIC_BASE_URL } = require('./minimax-config.cjs');

const OPENROUTER_DEFAULT = 'https://openrouter.ai/api/v1';
const DOME_AUTO_MODEL = 'dome/auto';

function resolveApiKeyProviderBaseUrl(queries, provider) {
  const custom = readProviderBaseUrl(queries, provider);
  if (custom) return custom;
  if (provider === 'openrouter') return OPENROUTER_DEFAULT;
  if (provider === 'minimax') return MINIMAX_ANTHROPIC_BASE_URL;
  return DEFAULT_BASE_URLS[provider];
}

/**
 * Dome Cloud solo acepta ids del catálogo del provider (`vendor/model`) o
 * `dome/auto`. Si el usuario dejó un id bare de OpenAI (p.ej. gpt-5.6-sol)
 * tras usar Codex/OpenAI, el provider responde 403 model_not_in_plan.
 *
 * @param {string | null | undefined} model
 * @returns {string}
 */
function coerceDomeCloudModel(model) {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || trimmed === DOME_AUTO_MODEL) return DOME_AUTO_MODEL;
  // Catálogo dome-provider: openai/gpt-5-nano, anthropic/claude-sonnet-5, …
  if (trimmed.includes('/')) return trimmed;
  return DOME_AUTO_MODEL;
}

/**
 * Persist a coerced model so subsequent runs and the Settings UI stay aligned.
 * @param {{ getSetting: { get: (key: string) => { value?: string } | undefined }, setSetting: { run: (key: string, value: string) => void } }} queries
 * @param {string} model
 */
function persistAiModelIfNeeded(queries, model) {
  const current = queries.getSetting.get('ai_model')?.value;
  if (current === model) return;
  try {
    queries.setSetting.run('ai_model', model);
  } catch (err) {
    console.warn('[ai-settings] could not persist coerced dome model:', err?.message || err);
  }
}

/**
 * Resolve which chat provider to use.
 *
 * `ai_provider` is authoritative when it is not Dome. Historically Settings
 * never wrote `ai_billing_mode` (default `dome_cloud`), which forced every
 * run through Dome — including ChatGPT Codex (`openai-codex` →
 * chatgpt.com/backend-api per docs/features/ai-provider-auth.md) and produced
 * 403 model_not_in_plan for models like gpt-5.6-luna.
 *
 * @param {string | null | undefined} billingMode
 * @param {string | null | undefined} configuredProvider
 * @returns {string}
 */
function resolveEffectiveProvider(billingMode, configuredProvider) {
  const provider = (configuredProvider || 'dome').trim() || 'dome';
  if (provider !== 'dome') return provider;
  if (billingMode === 'custom_api_key') return 'openai';
  return 'dome';
}

/**
 * Unified AI settings for ipc/ai, agent-team, run-engine, etc.
 *
 * @param {import('../core/database.cjs')} database
 * @returns {Promise<{ provider: string, apiKey?: string, model?: string, baseUrl?: string, billingMode?: string }>}
 */
async function getAISettings(database) {
  const queries = database.getQueries();
  const billingMode = queries.getSetting.get('ai_billing_mode')?.value || 'dome_cloud';
  const configuredProvider = queries.getSetting.get('ai_provider')?.value || 'dome';
  const provider = resolveEffectiveProvider(billingMode, configuredProvider);

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: readSettingSecret(queries, 'ollama_api_key') || undefined,
      model: queries.getSetting.get('ollama_model')?.value || 'llama3.2',
      baseUrl: queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434',
      billingMode,
    };
  }

  if (provider === 'dome') {
    const session = await domeOauth.getOrRefreshSession(database);
    const model = coerceDomeCloudModel(queries.getSetting.get('ai_model')?.value);
    persistAiModelIfNeeded(queries, model);
    return {
      provider: 'dome',
      apiKey: session?.accessToken,
      model,
      baseUrl: `${getDomeProviderBaseUrl()}/api/v1`,
      billingMode,
    };
  }

  if (provider === 'copilot') {
    const copilotOAuth = require('../auth/github-copilot-oauth.cjs');
    const { token, baseUrl } = await copilotOAuth.getCopilotToken(database);
    return {
      provider: 'copilot',
      apiKey: token,
      model: queries.getSetting.get('ai_model')?.value || 'gpt-4.1',
      baseUrl,
      billingMode,
    };
  }

  if (provider === 'claude-oauth') {
    const claudeOAuth = require('../auth/claude-oauth.cjs');
    const model = queries.getSetting.get('ai_model')?.value || DEFAULT_MODELS['claude-oauth'];
    try {
      const { token, baseUrl } = await claudeOAuth.getAccessToken(database);
      return { provider: 'claude-oauth', apiKey: token, model, baseUrl, billingMode };
    } catch {
      return {
        provider: 'claude-oauth',
        apiKey: undefined,
        model,
        baseUrl: claudeOAuth.DEFAULT_BASE_URL,
        billingMode,
      };
    }
  }

  if (provider === 'openai-codex') {
    const openaiCodexOAuth = require('../auth/openai-codex-oauth.cjs');
    const model = queries.getSetting.get('ai_model')?.value || DEFAULT_MODELS['openai-codex'];
    try {
      const { token, baseUrl } = await openaiCodexOAuth.getAccessToken(database);
      return { provider: 'openai-codex', apiKey: token, model, baseUrl, billingMode };
    } catch {
      return {
        provider: 'openai-codex',
        apiKey: undefined,
        model,
        baseUrl: openaiCodexOAuth.DEFAULT_BASE_URL,
        billingMode,
      };
    }
  }

  return {
    provider,
    apiKey: readProviderApiKey(queries, provider),
    model: queries.getSetting.get('ai_model')?.value || DEFAULT_MODELS[provider],
    baseUrl: resolveApiKeyProviderBaseUrl(queries, provider),
    billingMode,
  };
}

module.exports = { getAISettings, coerceDomeCloudModel, resolveEffectiveProvider };
