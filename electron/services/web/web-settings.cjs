/**
 * Web search/fetch provider settings (SQLite settings table).
 */

const database = require('../../core/database.cjs');

const VALID_SEARCH_PROVIDERS = new Set(['auto', 'tavily', 'brave', 'searxng', 'ddg']);
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
  const searchProvider = readSetting('web_search_provider', 'auto').toLowerCase().trim();
  const fetchProvider = readSetting('web_fetch_provider', 'auto').toLowerCase().trim();

  return {
    searchProvider: VALID_SEARCH_PROVIDERS.has(searchProvider) ? searchProvider : 'auto',
    fetchProvider: VALID_FETCH_PROVIDERS.has(fetchProvider) ? fetchProvider : 'auto',
    tavilyKey: readSetting('web_search_tavily_key', '').trim(),
    braveKey: readSetting('web_search_brave_key', '').trim(),
  };
}

module.exports = {
  VALID_SEARCH_PROVIDERS,
  VALID_FETCH_PROVIDERS,
  getWebSettings,
};
