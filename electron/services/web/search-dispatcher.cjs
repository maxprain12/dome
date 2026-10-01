/**
 * Orchestrates web search across configurable HTTP providers.
 */

const { getWebSettings } = require('./web-settings.cjs');
const { normalizeSearchRequest } = require('./http-utils.cjs');
const tavilySearch = require('./providers/tavily-search.cjs');
const braveSearch = require('./providers/brave-search.cjs');
const freeSearch = require('./free-search.cjs');

function buildProviderChain(settings) {
  const chain = [];

  const pushUnique = (id) => {
    if (!chain.includes(id)) chain.push(id);
  };

  switch (settings.searchProvider) {
    case 'exa':
      pushUnique('exa');
      break;
    case 'tavily':
      pushUnique('tavily');
      break;
    case 'brave':
      pushUnique('brave');
      break;
    case 'searxng':
      pushUnique('searxng');
      break;
    case 'ddg':
      pushUnique('ddg');
      break;
    case 'auto':
    default:
      if (settings.tavilyKey) pushUnique('tavily');
      if (settings.braveKey) pushUnique('brave');
      pushUnique('searxng');
      pushUnique('ddg');
      break;
  }

  return chain;
}

async function runProvider(providerId, request, settings) {
  switch (providerId) {
    case 'exa':
      if (!settings.exaKey) throw new Error('Exa API key is not configured');
      require('../../research/budget.cjs').reserve(require('../../core/database.cjs').getQueries(), 'web-search', 'exa');
      return require('./providers/exa-search.cjs').search(request, settings.exaKey);
    case 'tavily':
      return tavilySearch.search(request, settings.tavilyKey);
    case 'brave':
      return braveSearch.search(request, settings.braveKey);
    case 'searxng':
    case 'ddg':
      return freeSearch.searchProvider(providerId, request);
    default:
      throw new Error(`Unknown search provider: ${providerId}`);
  }
}

async function searchWeb(input) {
  let request;
  try {
    request = normalizeSearchRequest(input);
  } catch (error) {
    return {
      success: false,
      provider: 'http',
      engine: 'unknown',
      query: '',
      count: 0,
      results: [],
      error: error?.message || String(error),
    };
  }

  if (!request.query) {
    return {
      success: false,
      provider: 'http',
      engine: 'unknown',
      query: '',
      count: 0,
      results: [],
      error: 'Query is required',
    };
  }

  const settings = getWebSettings();
  const chain = buildProviderChain(settings);
  const errors = [];
  let retryAfterMs = 0;

  for (const providerId of chain) {
    try {
      return await runProvider(providerId, request, settings);
    } catch (error) {
      request.signal?.throwIfAborted();
      retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs || 0);
      errors.push(`${providerId}: ${error?.message || String(error)}`);
    }
  }

  return {
    success: false,
    provider: chain[chain.length - 1] || 'http',
    engine: chain[chain.length - 1] || 'unknown',
    query: request.query,
    count: 0,
    results: [],
    error: errors.join('; ') || 'All search providers failed',
    ...(retryAfterMs ? { code: 'search_unavailable', retryAfterMs, retryable: false } : {}),
  };
}

module.exports = {
  searchWeb,
  buildProviderChain,
};
