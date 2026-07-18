'use strict';

/**
 * Provider authentication rules — main process source of truth.
 * Keep Ollama hostname logic in sync with packages/ai/src/ollama-mode.ts and app/lib/ai/providerAuth.ts.
 *
 * @see docs/features/ai-provider-auth.md
 */

const LOCAL_OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Placeholder for OpenAI SDK when local Ollama needs no real auth. */
const OLLAMA_LOCAL_PLACEHOLDER_KEY = 'ollama-local';

const API_KEY_CHAT_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'deepseek',
  'moonshot',
  'qwen',
  'opencode',
  'opencode-go',
]);

/**
 * @param {string | undefined} baseUrl
 * @returns {'local' | 'cloud'}
 */
function resolveOllamaMode(baseUrl) {
  if (!baseUrl || !String(baseUrl).trim()) {
    return 'local';
  }
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return LOCAL_OLLAMA_HOSTS.has(hostname) ? 'local' : 'cloud';
  } catch {
    return 'local';
  }
}

/**
 * @param {string | undefined} baseUrl
 * @returns {boolean}
 */
function ollamaRequiresApiKey(baseUrl) {
  return resolveOllamaMode(baseUrl) === 'cloud';
}

/**
 * Resolve API key for Ollama requests (real key, cloud error, or local placeholder).
 *
 * @param {string | undefined} baseUrl
 * @param {string | undefined} apiKey
 * @returns {string}
 */
function resolveOllamaApiKey(baseUrl, apiKey) {
  const trimmed = apiKey && String(apiKey).trim();
  if (trimmed) return trimmed;
  if (ollamaRequiresApiKey(baseUrl)) {
    throw new Error('Ollama cloud requires an API key. Open Settings > AI and add your Ollama API key.');
  }
  return OLLAMA_LOCAL_PLACEHOLDER_KEY;
}

/**
 * @param {string | undefined} baseUrl
 * @param {string | undefined} apiKey
 */
function assertOllamaAuthReady(baseUrl, apiKey) {
  if (ollamaRequiresApiKey(baseUrl) && !(apiKey && String(apiKey).trim())) {
    throw new Error('Ollama cloud requires an API key. Open Settings > AI and add your Ollama API key.');
  }
}

/**
 * Pre-flight auth check before chat/agent runs.
 *
 * @param {string} provider
 * @param {{ apiKey?: string, baseUrl?: string, ollamaBaseUrl?: string, ollamaApiKey?: string }} settings
 */
function assertProviderAuthReady(provider, settings = {}) {
  if (provider === 'ollama') {
    const baseUrl = settings.ollamaBaseUrl || settings.baseUrl;
    assertOllamaAuthReady(baseUrl, settings.ollamaApiKey ?? settings.apiKey);
    return;
  }

  if (
    provider === 'dome' ||
    provider === 'copilot' ||
    provider === 'claude-oauth' ||
    provider === 'openai-codex'
  ) {
    return;
  }

  if (API_KEY_CHAT_PROVIDERS.has(provider) && !(settings.apiKey && String(settings.apiKey).trim())) {
    throw new Error(`API key not configured for ${provider}`);
  }
}

/**
 * Whether the provider can run without a user API key (Ollama local only).
 *
 * @param {string} provider
 * @param {string | undefined} ollamaBaseUrl
 * @returns {boolean}
 */
function isProviderAvailableWithoutApiKey(provider, ollamaBaseUrl) {
  if (provider === 'ollama') {
    return !ollamaRequiresApiKey(ollamaBaseUrl);
  }
  return (
    provider === 'dome' ||
    provider === 'copilot' ||
    provider === 'claude-oauth' ||
    provider === 'openai-codex'
  );
}

module.exports = {
  OLLAMA_LOCAL_PLACEHOLDER_KEY,
  resolveOllamaMode,
  ollamaRequiresApiKey,
  resolveOllamaApiKey,
  assertOllamaAuthReady,
  assertProviderAuthReady,
  isProviderAvailableWithoutApiKey,
  API_KEY_CHAT_PROVIDERS,
};
