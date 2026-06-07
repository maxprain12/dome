/* eslint-disable no-console */
const database = require('../core/database.cjs');

const PROVIDER_DEFAULTS = {
  minimax: { model: 'MiniMax-M3', envKey: 'MINIMAX_BENCH_API_KEY' },
  openrouter: { model: 'anthropic/claude-3.5-sonnet', envKey: 'OPENROUTER_BENCH_API_KEY' },
};

/**
 * Apply bench provider credentials to isolated SQLite settings.
 */
function applyProviderSettings(provider, model) {
  const queries = database.getQueries();
  if (!queries) throw new Error('Database not initialized');

  const def = PROVIDER_DEFAULTS[provider];
  if (!def) throw new Error(`Unsupported bench provider: ${provider}`);

  const apiKey = process.env[def.envKey] || process.env.AI_API_KEY || process.env.ai_api_key;
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${provider}. Set ${def.envKey} in .env (see docs/bench/README.md).`,
    );
  }

  const ts = Date.now();
  const resolvedModel = model || def.model;
  queries.setSetting.run('ai_provider', provider, ts);
  queries.setSetting.run('ai_api_key', apiKey, ts);
  queries.setSetting.run('ai_model', resolvedModel, ts);

  return { provider, model: resolvedModel, apiKey };
}

/**
 * Read provider config (same as run-engine getProviderConfig, inlined for bench).
 */
async function getBenchProviderConfig(providerArg, modelArg) {
  const queries = database.getQueries();
  const provider = providerArg || queries.getSetting.get('ai_provider')?.value || 'minimax';
  const apiKey = queries.getSetting.get('ai_api_key')?.value;
  if (!apiKey) throw new Error(`API key not configured for ${provider}`);
  const model = modelArg || queries.getSetting.get('ai_model')?.value;
  return { provider, apiKey, baseUrl: undefined, model };
}

module.exports = { applyProviderSettings, getBenchProviderConfig, PROVIDER_DEFAULTS };
