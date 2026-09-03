'use strict';

/**
 * Per-request provider auth via @dome/ai resolveProviderAuth + Dome settings store.
 * Refreshes OAuth (Copilot / Claude / Codex) on each agent or LLM call.
 */

const { createDomeCredentialStore } = require('./dome-credential-store.cjs');

const DOME_TO_PI_PROVIDER = {
  copilot: 'github-copilot',
  'claude-oauth': 'anthropic',
  'openai-codex': 'openai-codex',
  moonshot: 'moonshotai',
  qwen: 'qwen-token-plan',
};

let cachedStore = null;
let cachedDatabase = null;

function credentialStoreFor(database) {
  if (cachedStore && cachedDatabase === database) return cachedStore;
  cachedDatabase = database;
  cachedStore = createDomeCredentialStore(database);
  return cachedStore;
}

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
  const providers = typeof ai.builtinProviders === 'function' ? ai.builtinProviders() : [];
  const provider = providers.find((p) => p && p.id === providerId);
  if (!provider?.auth) return undefined;

  const credentials = credentialStoreFor(opts.database);
  const authContext =
    typeof ai.defaultProviderAuthContext === 'function'
      ? ai.defaultProviderAuthContext()
      : { env: async () => undefined, fileExists: async () => false };

  const overrides = {};
  if (opts.apiKey && provider.auth.apiKey) overrides.apiKey = opts.apiKey;

  const result = await ai.resolveProviderAuth(provider, credentials, authContext, overrides);
  if (!result?.auth) return undefined;
  return {
    apiKey: result.auth.apiKey,
    headers: result.auth.headers,
    baseUrl: result.auth.baseUrl,
  };
}

module.exports = { resolveRequestAuth, piProviderId, credentialStoreFor };
