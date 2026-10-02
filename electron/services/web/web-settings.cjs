/**
 * URL reader provider settings (SQLite settings table).
 */

const database = require('../../core/database.cjs');

const VALID_FETCH_PROVIDERS = new Set(['auto', 'jina', 'readability', 'tavily']);

function readSetting(key, fallback = '') {
  try {
    const queries = database.getQueries();
    return queries.getSetting.get(key)?.value || fallback;
  } catch {
    return fallback;
  }
}

function getWebSettings() {
  const fetchProvider = readSetting('web_fetch_provider', 'auto').toLowerCase().trim();

  return {
    fetchProvider: VALID_FETCH_PROVIDERS.has(fetchProvider) ? fetchProvider : 'auto',
    tavilyKey: require('../../core/settings-secrets.cjs').readSettingSecret(database.getQueries(), 'web_fetch_tavily_key') || '',
  };
}

module.exports = {
  VALID_FETCH_PROVIDERS,
  getWebSettings,
};
