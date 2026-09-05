'use strict';
/**
 * Per-provider API keys and base URLs.
 *
 * Each AI provider stores its own credentials in settings —
 * `ai_api_key_<provider>` (encrypted via settings-secrets) and
 * `ai_base_url_<provider>` — so switching providers never loses keys.
 * Migration 42 copies the legacy shared `ai_api_key` / `ai_base_url` into the
 * active provider's slots; the legacy keys remain only as a read fallback for
 * that same provider (never leaked to others).
 */

const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

/** Providers without ai_api_key_<provider> slot (OAuth or Ollama local/cloud via ollama_api_key). */
const KEYLESS_PROVIDERS = new Set(['dome', 'copilot', 'ollama', 'claude-oauth', 'openai-codex']);

function providerApiKeySetting(provider) {
  return `ai_api_key_${provider}`;
}

function providerBaseUrlSetting(provider) {
  return `ai_base_url_${provider}`;
}

/**
 * Read the API key for a provider. Falls back to the legacy shared
 * `ai_api_key` ONLY when the provider is the currently active one (covers
 * pre-migration rows without leaking one provider's key to another).
 */
function readProviderApiKey(queries, provider) {
  if (!provider || KEYLESS_PROVIDERS.has(provider)) return null;
  const own = readSettingSecret(queries, providerApiKeySetting(provider));
  if (own) return own;
  const active = queries.getSetting.get('ai_provider')?.value;
  if (active === provider) {
    return readSettingSecret(queries, 'ai_api_key');
  }
  return null;
}

function writeProviderApiKey(queries, provider, plain) {
  if (!provider || KEYLESS_PROVIDERS.has(provider)) return;
  writeSettingSecret(queries, providerApiKeySetting(provider), plain);
}

const LOCAL_BASE_URL_PROVIDERS = new Set(['ollama', 'vllm', 'lmstudio']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * @param {string} url
 * @returns {boolean}
 */
function isLoopbackBaseUrl(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(String(url || ''));
  }
}

/** Custom base URL for a provider (same active-provider-only legacy fallback). */
function readProviderBaseUrl(queries, provider) {
  if (!provider) return undefined;
  const own = queries.getSetting.get(providerBaseUrlSetting(provider))?.value;
  if (own && String(own).trim()) return String(own).trim().replace(/\/$/, '');
  const active = queries.getSetting.get('ai_provider')?.value;
  if (active === provider) {
    const legacy = queries.getSetting.get('ai_base_url')?.value;
    const trimmed = legacy && String(legacy).trim() ? String(legacy).trim().replace(/\/$/, '') : '';
    if (!trimmed) return undefined;
    // Shared `ai_base_url` is leftover from whichever provider was last saved.
    // After LM Studio/vLLM, it is localhost — MiniMax/OpenAI must not inherit it.
    if (!LOCAL_BASE_URL_PROVIDERS.has(provider) && isLoopbackBaseUrl(trimmed)) {
      return undefined;
    }
    return trimmed;
  }
  return undefined;
}

function writeProviderBaseUrl(queries, provider, value) {
  if (!provider) return;
  queries.setSetting.run(providerBaseUrlSetting(provider), String(value ?? '').trim(), Date.now());
}

/** True if the provider has a stored API key (per-provider or active-legacy). */
function hasProviderApiKey(queries, provider) {
  return Boolean(readProviderApiKey(queries, provider));
}

module.exports = {
  KEYLESS_PROVIDERS,
  LOCAL_BASE_URL_PROVIDERS,
  isLoopbackBaseUrl,
  providerApiKeySetting,
  providerBaseUrlSetting,
  readProviderApiKey,
  writeProviderApiKey,
  readProviderBaseUrl,
  writeProviderBaseUrl,
  hasProviderApiKey,
};
