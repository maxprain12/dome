/* eslint-disable no-console */
/**
 * Shared OpenAI API key resolution for TTS and Transcription.
 */
const { readSettingSecret } = require('../core/settings-secrets.cjs');

async function getOpenAIKey(database) {
  try {
    const queries = database.getQueries();

    const dedicated = await readSettingSecret(queries, 'transcription_openai_api_key');
    if (dedicated) return dedicated;

    // Per-provider slot (always OpenAI's own key, regardless of active provider)
    const perProvider = await readSettingSecret(queries, 'ai_api_key_openai');
    if (perProvider) return perProvider;

    const providerRow = await queries.getSetting.get('ai_provider');
    if (providerRow?.value === 'openai') {
      const k = await readSettingSecret(queries, 'ai_api_key');
      if (k) return k;
    }

    const legacy = await readSettingSecret(queries, 'openai_api_key');
    if (legacy) return legacy;

    const any = await readSettingSecret(queries, 'ai_api_key');
    if (any) return any;

    return null;
  } catch (err) {
    console.error('[OpenAIKey] Error resolving key:', err);
    return null;
  }
}

module.exports = { getOpenAIKey };
