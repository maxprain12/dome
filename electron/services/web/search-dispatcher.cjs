/**
 * Orchestrates web search across configurable HTTP providers.
 */

const { getWebSettings } = require('./web-settings.cjs');
const { normalizeSearchRequest } = require('./http-utils.cjs');
const tavilySearch = require('./providers/tavily-search.cjs');
const braveSearch = require('./providers/brave-search.cjs');
const searxngSearch = require('./providers/searxng.cjs');
const ddgSearch = require('./providers/ddg-html.cjs');

function buildProviderChain(settings) {
  const chain = [];

  const pushUnique = (id) => {
    if (!chain.includes(id)) chain.push(id);
  };

  switch (settings.searchProvider) {
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
    case 'tavily':
      return tavilySearch.search(request, settings.tavilyKey);
    case 'brave':
      return braveSearch.search(request, settings.braveKey);
    case 'searxng':
      return searxngSearch.search(request);
    case 'ddg':
      return ddgSearch.search(request);
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

  const settings = await getWebSettings();
  const chain = buildProviderChain(settings);
  const errors = [];

  for (const providerId of chain) {
    try {
      return await runProvider(providerId, request, settings);
    } catch (error) {
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
  };
}

module.exports = {
  searchWeb,
  buildProviderChain,
};
