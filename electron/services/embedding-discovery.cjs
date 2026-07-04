/* eslint-disable no-console */
'use strict';

const { getEmbeddingContextTokens, extractOllamaContextLength } = require('./embedding-context.cjs');

const TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { at: number, models: DiscoveredEmbeddingModel[], source: 'remote' | 'static' }>} */
const cache = new Map();

/** Static fallback mirrors app/lib/ai/models.ts */
const STATIC_MODELS = {
  openai: [
    { id: 'text-embedding-3-small', name: 'Embedding 3 Small', dimensions: 1536, recommended: true },
    { id: 'text-embedding-3-large', name: 'Embedding 3 Large', dimensions: 3072 },
    { id: 'text-embedding-ada-002', name: 'Ada 002', dimensions: 1536 },
  ],
  google: [
    { id: 'text-embedding-004', name: 'Text Embedding 004', dimensions: 768, recommended: true },
    { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', dimensions: 3072 },
  ],
  ollama: [
    { id: 'nomic-embed-text', name: 'Nomic Embed Text', dimensions: 768, recommended: true },
    { id: 'mxbai-embed-large', name: 'mxbai-embed-large', dimensions: 1024 },
    { id: 'all-minilm', name: 'all-minilm', dimensions: 384 },
  ],
};

const OPENAI_DIMENSIONS = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

const GOOGLE_DIMENSIONS = {
  'text-embedding-004': 768,
  'gemini-embedding-001': 3072,
  'embedding-001': 768,
};

const EMBEDDING_NAME_HINTS = ['embed', 'nomic', 'bge', 'mxbai', 'all-minilm', 'gte', 'snowflake-arctic'];

/**
 * @typedef {{ id: string, name: string, dimensions?: number, contextTokens?: number, recommended?: boolean }} DiscoveredEmbeddingModel
 */

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, apiKey?: string }} [options]
 */
async function httpJson(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${json.error?.message || json.error || text.slice(0, 300)}`);
  }
  return json;
}

/**
 * @param {string} name
 */
function looksLikeEmbeddingModel(name) {
  const lower = String(name || '').toLowerCase();
  return EMBEDDING_NAME_HINTS.some((hint) => lower.includes(hint));
}

/**
 * @param {string} baseUrl
 * @param {string} [apiKey]
 * @returns {Promise<DiscoveredEmbeddingModel[]>}
 */
async function discoverOllamaModels(baseUrl, apiKey) {
  const root = String(baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const tags = await httpJson(`${root}/api/tags`, { apiKey });
  const rows = Array.isArray(tags.models) ? tags.models : [];
  /** @type {DiscoveredEmbeddingModel[]} */
  const out = [];

  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name : '';
    if (!name) continue;
    let isEmbedding = looksLikeEmbeddingModel(name);
    let contextTokens;
    let dimensions;

    try {
      const show = await httpJson(`${root}/api/show`, {
        method: 'POST',
        apiKey,
        body: { name, verbose: false },
      });
      const caps = Array.isArray(show.capabilities) ? show.capabilities : [];
      if (caps.some((c) => String(c).toLowerCase() === 'embedding')) {
        isEmbedding = true;
      }
      contextTokens = extractOllamaContextLength(name, show.model_info) ?? undefined;
    } catch {
      /* keep heuristic */
    }

    if (!isEmbedding) continue;

    const id = name.split(':')[0];
    out.push({
      id: name,
      name: id,
      dimensions,
      contextTokens,
      recommended: id === 'nomic-embed-text',
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * @param {string} apiKey
 * @returns {Promise<DiscoveredEmbeddingModel[]>}
 */
function buildGoogleModelFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
  if (!methods.includes('embedContent')) return null;
  const rawName = typeof row.name === 'string' ? row.name : '';
  const id = rawName.replace(/^models\//, '');
  if (!id) return null;
  const displayName = typeof row.displayName === 'string' ? row.displayName : id;
  const contextTokens = Number(row.inputTokenLimit);
  return {
    id,
    name: displayName,
    dimensions: GOOGLE_DIMENSIONS[id],
    contextTokens: Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : undefined,
    recommended: id === 'text-embedding-004',
  };
}

async function discoverGoogleModels(apiKey) {
  const json = await httpJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  const rows = Array.isArray(json.models) ? json.models : [];
  /** @type {DiscoveredEmbeddingModel[]} */
  const out = [];

  for (const row of rows) {
    const model = buildGoogleModelFromRow(row);
    if (model) out.push(model);
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * @param {string} apiKey
 * @returns {Promise<DiscoveredEmbeddingModel[]>}
 */
async function discoverOpenAiModels(apiKey) {
  const json = await httpJson('https://api.openai.com/v1/models', { apiKey });
  const rows = Array.isArray(json.data) ? json.data : [];
  /** @type {DiscoveredEmbeddingModel[]} */
  const out = [];

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || !id.toLowerCase().includes('embedding')) continue;
    out.push({
      id,
      name: id,
      dimensions: OPENAI_DIMENSIONS[id],
      contextTokens: 8191,
      recommended: id === 'text-embedding-3-small',
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * @param {string} provider
 * @param {DiscoveredEmbeddingModel[]} models
 */
function staticFallback(provider) {
  return STATIC_MODELS[provider] || [];
}

/**
 * @param {{ provider: string, apiKey?: string, baseUrl?: string }} params
 * @returns {Promise<{ models: DiscoveredEmbeddingModel[], source: 'remote' | 'static' }>}
 */
async function listEmbeddingModels(params) {
  const provider = String(params.provider || '').toLowerCase();
  const apiKey = String(params.apiKey || '').trim();
  const baseUrl = String(params.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const cacheKey = `${provider}:${apiKey.slice(0, 8)}:${baseUrl}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return { models: cached.models, source: cached.source };
  }

  try {
    /** @type {DiscoveredEmbeddingModel[]} */
    let models = [];
    if (provider === 'ollama') {
      models = await discoverOllamaModels(baseUrl, apiKey);
    } else if (provider === 'google') {
      if (!apiKey) throw new Error('API key required');
      models = await discoverGoogleModels(apiKey);
    } else if (provider === 'openai') {
      if (!apiKey) throw new Error('API key required');
      models = await discoverOpenAiModels(apiKey);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    if (models.length === 0) {
      const fallback = staticFallback(provider);
      return { models: fallback, source: 'static' };
    }

    cache.set(cacheKey, { at: Date.now(), models, source: 'remote' });
    return { models, source: 'remote' };
  } catch (err) {
    console.warn('[embedding-discovery]', provider, err?.message || err);
    const fallback = staticFallback(provider);
    cache.set(cacheKey, { at: Date.now(), models: fallback, source: 'static' });
    return { models: fallback, source: 'static' };
  }
}

function clearDiscoveryCache() {
  cache.clear();
}

module.exports = {
  listEmbeddingModels,
  clearDiscoveryCache,
  STATIC_MODELS,
};
