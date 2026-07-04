/* eslint-disable no-console */
const database = require('../core/database.cjs');
const { readSettingSecret, writeSettingSecret } = require('../core/settings-secrets.cjs');

const PROVIDER_DEFAULTS = {
  minimax: {
    model: 'MiniMax-M2.7-highspeed',
    envKeys: ['MINIMAX_API_KEY', 'MINIMAX_BENCH_API_KEY', 'AI_API_KEY'],
  },
};

/**
 * Apply Sonar loop provider credentials to isolated SQLite settings.
 * Jenkins: set credential as env MINIMAX_API_KEY.
 */
function applyProviderSettings(provider, model) {
  const queries = database.getQueries();
  if (!queries) throw new Error('Database not initialized');

  const def = PROVIDER_DEFAULTS[provider];
  if (!def) throw new Error(`Unsupported sonar-loop provider: ${provider}`);

  let apiKey = null;
  for (const key of def.envKeys) {
    if (process.env[key]) {
      apiKey = process.env[key];
      break;
    }
  }
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${provider}. Set MINIMAX_API_KEY (Jenkins credential) or MINIMAX_BENCH_API_KEY.`,
    );
  }

  const ts = Date.now();
  const resolvedModel =
    model || process.env.SONAR_LOOP_MODEL || process.env.MINIMAX_MODEL || def.model;
  queries.setSetting.run('ai_provider', provider, ts);
  writeSettingSecret(queries, 'ai_api_key', apiKey);
  queries.setSetting.run('ai_model', resolvedModel, ts);

  return { provider, model: resolvedModel };
}

async function getSonarLoopProviderConfig(providerArg, modelArg) {
  const queries = database.getQueries();
  const provider = providerArg || queries.getSetting.get('ai_provider')?.value || 'minimax';
  const apiKey = readSettingSecret(queries, 'ai_api_key');
  if (!apiKey) throw new Error(`API key not configured for ${provider}`);
  const model =
    modelArg ||
    queries.getSetting.get('ai_model')?.value ||
    process.env.SONAR_LOOP_MODEL ||
    PROVIDER_DEFAULTS.minimax.model;
  return { provider, apiKey, baseUrl: undefined, model };
}

module.exports = { applyProviderSettings, getSonarLoopProviderConfig, PROVIDER_DEFAULTS };
