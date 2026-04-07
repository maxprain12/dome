/* eslint-disable no-console */
/**
 * Shared OpenAI API key resolution for TTS, Realtime, and Transcription.
 *
 * Priority order:
 *   1. transcription_openai_api_key  — dedicated TTS/STT key (set in Transcription settings)
 *   2. ai_api_key                    — main AI key when provider is OpenAI
 *   3. openai_api_key                — legacy key setting
 *   4. ai_api_key                    — any AI key as last resort
 */

/**
 * @param {Object} database - Database module
 * @returns {string|null}
 */
function getOpenAIKey(database) {
  try {
    const queries = database.getQueries();

    // 1. Dedicated transcription/TTS key (takes priority regardless of chat provider)
    const dedicated = queries.getSetting.get('transcription_openai_api_key');
    if (dedicated?.value && String(dedicated.value).trim()) {
      return String(dedicated.value).trim();
    }

    // 2. Main AI provider key when provider is OpenAI
    const providerRow = queries.getSetting.get('ai_provider');
    if (providerRow?.value === 'openai') {
      const k = queries.getSetting.get('ai_api_key')?.value;
      if (k && String(k).trim()) return String(k).trim();
    }

    // 3. Legacy openai_api_key setting
    const legacy = queries.getSetting.get('openai_api_key')?.value;
    if (legacy && String(legacy).trim()) return String(legacy).trim();

    // 4. Any ai_api_key regardless of provider (last resort)
    const any = queries.getSetting.get('ai_api_key')?.value;
    if (any && String(any).trim()) return String(any).trim();

    return null;
  } catch (err) {
    console.error('[OpenAIKey] Error resolving key:', err);
    return null;
  }
}

module.exports = { getOpenAIKey };
