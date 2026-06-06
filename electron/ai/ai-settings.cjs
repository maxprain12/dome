'use strict';

const { getDomeProviderBaseUrl } = require('./dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');

/**
 * Unified AI settings for ipc/ai, agent-team, run-engine, etc.
 *
 * @param {import('../core/database.cjs')} database
 * @returns {Promise<{ provider: string, apiKey?: string, model?: string, baseUrl?: string }>}
 */
async function getAISettings(database) {
  const queries = database.getQueries();
  const provider = queries.getSetting.get('ai_provider')?.value || 'ollama';

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: queries.getSetting.get('ollama_api_key')?.value || undefined,
      model: queries.getSetting.get('ollama_model')?.value || 'llama3.2',
      baseUrl: queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434',
    };
  }

  if (provider === 'dome') {
    const session = await domeOauth.getOrRefreshSession(database);
    return {
      provider: 'dome',
      apiKey: session?.accessToken,
      model: queries.getSetting.get('ai_model')?.value || 'dome/auto',
      baseUrl: `${getDomeProviderBaseUrl()}/api/v1`,
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
    };
  }

  return {
    provider,
    apiKey: queries.getSetting.get('ai_api_key')?.value,
    model: queries.getSetting.get('ai_model')?.value,
    baseUrl: undefined,
  };
}

module.exports = { getAISettings };
