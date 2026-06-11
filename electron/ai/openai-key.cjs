/* eslint-disable no-console */
/**
 * Shared OpenAI API key resolution for TTS and Transcription.
 */
const { readSettingSecret } = require('../core/settings-secrets.cjs');

function getOpenAIKey(database) {
  try {
    const queries = database.getQueries();

    const dedicated = readSettingSecret(queries, 'transcription_openai_api_key');
    if (dedicated) return dedicated;

    // Per-provider slot (always OpenAI's own key, regardless of active provider)
    const perProvider = readSettingSecret(queries, 'ai_api_key_openai');
    if (perProvider) return perProvider;

    const providerRow = queries.getSetting.get('ai_provider');
    if (providerRow?.value === 'openai') {
      const k = readSettingSecret(queries, 'ai_api_key');
      if (k) return k;
    }

    const legacy = readSettingSecret(queries, 'openai_api_key');
    if (legacy) return legacy;

    const any = readSettingSecret(queries, 'ai_api_key');
    if (any) return any;

    return null;
  } catch (err) {
    console.error('[OpenAIKey] Error resolving key:', err);
    return null;
  }
}

module.exports = { getOpenAIKey };
