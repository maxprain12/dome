'use strict';

/**
 * Per-request provider auth via @dome/ai resolveProviderAuth + Dome settings store.
 * Refreshes OAuth (Copilot / Claude / Codex) on each agent or LLM call.
 */


const DOME_TO_PI_PROVIDER = {
  copilot: 'github-copilot',
  'claude-oauth': 'anthropic',
  'openai-codex': 'openai-codex',
  moonshot: 'moonshotai',
  qwen: 'qwen-token-plan',
  'azure-openai-responses': 'azure',
};

const { credentialStoreFor, getModelCollection } = require('./model-collection.cjs');

function piProviderId(domeProvider, resolvedModel) {
  if (resolvedModel?.provider) return resolvedModel.provider;
  return DOME_TO_PI_PROVIDER[domeProvider] || domeProvider;
}

/**
 * @param {typeof import('@dome/ai')} ai
 * @param {{ provider: string, resolvedModel?: object, apiKey?: string, database: object }} opts
 * @returns {Promise<{ apiKey?: string, headers?: Record<string, string>, baseUrl?: string } | undefined>}
 */
async function resolveRequestAuth(ai, opts) {
  const providerId = piProviderId(opts.provider, opts.resolvedModel);
  const models = await getModelCollection(opts.database);
  const provider = models.getProvider(providerId);
  if (!provider?.auth) return undefined;
  const overrides = {};
  if (opts.apiKey && provider.auth.apiKey) overrides.apiKey = opts.apiKey;
  const result = await models.getAuth(opts.resolvedModel || providerId, overrides);
  if (!result?.auth) return undefined;
  return {
    apiKey: result.auth.apiKey,
    headers: result.auth.headers,
    baseUrl: result.auth.baseUrl,
  };
}

module.exports = { resolveRequestAuth, piProviderId, credentialStoreFor };
