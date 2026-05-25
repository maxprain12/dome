/* eslint-disable no-console */
/**
 * Fetch and normalize provider model lists with short-lived in-memory cache.
 * Supports OpenAI, Anthropic, Google, MiniMax; delegates OpenRouter to openrouter-models.cjs.
 */
'use strict';

const crypto = require('crypto');
const { fetchOpenRouterModels } = require('./openrouter-models.cjs');

const TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, { at: number, models: NormalizedModel[] }>} */
const cache = new Map();

/** Static recommended ids per provider (merged when present in API response). */
const CURATED_IDS = {
  openai: new Set(['gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-oss-120b']),
  anthropic: new Set(['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5']),
  google: new Set(['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']),
  minimax: new Set(['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5-highspeed']),
};

/**
 * @typedef {object} NormalizedModel
 * @property {string} id
 * @property {string} name
 * @property {number} contextWindow
 * @property {boolean} reasoning
 * @property {Array<'text'|'image'>} input
 * @property {number} maxTokens
 * @property {boolean} [recommended]
 * @property {string} [description]
 * @property {string} api
 */

/**
 * @param {string} provider
 * @param {string} apiKey
 * @returns {string}
 */
function cacheKey(provider, apiKey) {
  const hash = crypto.createHash('sha256').update(String(apiKey || '')).digest('hex').slice(0, 16);
  return `${provider}:${hash}`;
}

/**
 * @param {string} provider
 * @param {string} key
 * @returns {NormalizedModel[] | null}
 */
function getCached(provider, key) {
  const entry = cache.get(cacheKey(provider, key));
  if (!entry) return null;
  if (Date.now() - entry.at >= TTL_MS) {
    cache.delete(cacheKey(provider, key));
    return null;
  }
  return entry.models;
}

/**
 * @param {string} provider
 * @param {string} key
 * @param {NormalizedModel[]} models
 */
function setCached(provider, key, models) {
  cache.set(cacheKey(provider, key), { at: Date.now(), models });
}

/**
 * @param {string} id
 * @param {string} [displayName]
 * @param {object} [opts]
 * @returns {NormalizedModel}
 */
function makeModel(id, displayName, opts = {}) {
  const curated = opts.curated === true;
  return {
    id,
    name: displayName && displayName.trim() ? displayName.trim() : id,
    contextWindow: opts.contextWindow ?? 128000,
    reasoning: opts.reasoning ?? /o1|o3|reasoning|think|r1/i.test(id),
    input: opts.input ?? ['text'],
    maxTokens: opts.maxTokens ?? 8192,
    recommended: curated,
    description: opts.description,
    api: opts.api ?? 'openai-completions',
  };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isOpenAiChatModel(id) {
  const lower = id.toLowerCase();
  if (lower.includes('whisper') || lower.includes('tts') || lower.includes('embedding') || lower.includes('dall-e') || lower.includes('moderation')) {
    return false;
  }
  return (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('chatgpt-')
  );
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isMiniMaxChatModel(id) {
  const lower = id.toLowerCase();
  if (lower.includes('hailuo') || lower.includes('video') || lower.includes('music') || lower.includes('image') || lower.includes('speech') || lower.includes('tts')) {
    return false;
  }
  return lower.startsWith('minimax-') || lower.startsWith('m2-') || lower === 'abab';
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchOpenAiModels(apiKey) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `OpenAI models failed (${res.status}): ${text.slice(0, 500)}` };
  }
  const json = /** @type {Record<string, unknown>} */ (await res.json());
  const data = Array.isArray(json.data) ? json.data : [];
  const curated = CURATED_IDS.openai;
  const models = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || !isOpenAiChatModel(id)) continue;
    models.push(makeModel(id, id, { curated: curated.has(id), api: 'openai-completions' }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchAnthropicModels(apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `Anthropic models failed (${res.status}): ${text.slice(0, 500)}` };
  }
  const json = /** @type {Record<string, unknown>} */ (await res.json());
  const data = Array.isArray(json.data) ? json.data : [];
  const curated = CURATED_IDS.anthropic;
  const models = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (r.type && r.type !== 'model') continue;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) continue;
    const displayName = typeof r.display_name === 'string' ? r.display_name : id;
    const ctx = Number(r.max_input_tokens);
    models.push(makeModel(id, displayName, {
      curated: curated.has(id),
      contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : 200000,
      api: 'anthropic-messages',
    }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchGoogleModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `Google models failed (${res.status}): ${text.slice(0, 500)}` };
  }
  const json = /** @type {Record<string, unknown>} */ (await res.json());
  const data = Array.isArray(json.models) ? json.models : [];
  const curated = CURATED_IDS.google;
  const models = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const methods = Array.isArray(r.supportedGenerationMethods) ? r.supportedGenerationMethods : [];
    if (!methods.includes('generateContent')) continue;
    const rawName = typeof r.name === 'string' ? r.name : '';
    const id = rawName.replace(/^models\//, '');
    if (!id) continue;
    const displayName = typeof r.displayName === 'string' ? r.displayName : id;
    const ctx = Number(r.inputTokenLimit);
    const input = /** @type {Array<'text'|'image'>} */ (['text']);
    if (String(r.description || '').toLowerCase().includes('vision') || id.includes('vision')) {
      input.push('image');
    }
    models.push(makeModel(id, displayName, {
      curated: curated.has(id),
      contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : 1000000,
      api: 'google-generative',
      description: typeof r.description === 'string' ? r.description : undefined,
    }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchMiniMaxModels(apiKey) {
  const res = await fetch('https://api.minimax.io/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `MiniMax models failed (${res.status}): ${text.slice(0, 500)}` };
  }
  const json = /** @type {Record<string, unknown>} */ (await res.json());
  const data = Array.isArray(json.data) ? json.data : [];
  const curated = CURATED_IDS.minimax;
  const models = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || !isMiniMaxChatModel(id)) continue;
    models.push(makeModel(id, id, { curated: curated.has(id), api: 'openai-completions' }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

const DOME_MODELS = [
  makeModel('dome/auto', 'Dome Auto', { curated: true, api: 'openai-completions' }),
];

/**
 * @param {string} provider
 * @param {{ apiKey?: string }} [options]
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchProviderModels(provider, options = {}) {
  const normalized = String(provider || '').trim().toLowerCase();
  const apiKey = String(options.apiKey || '').trim();

  if (normalized === 'dome') {
    return { success: true, models: DOME_MODELS };
  }

  if (normalized === 'openrouter') {
    return fetchOpenRouterModels(apiKey);
  }

  if (normalized === 'ollama') {
    return { success: false, error: 'Use ollama:list-models for Ollama.' };
  }

  const cloudProviders = ['openai', 'anthropic', 'google', 'minimax'];
  if (!cloudProviders.includes(normalized)) {
    return { success: false, error: `Unsupported provider: ${provider}` };
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required.' };
  }

  const cached = getCached(normalized, apiKey);
  if (cached) {
    return { success: true, models: cached };
  }

  try {
    let result;
    switch (normalized) {
      case 'openai':
        result = await fetchOpenAiModels(apiKey);
        break;
      case 'anthropic':
        result = await fetchAnthropicModels(apiKey);
        break;
      case 'google':
        result = await fetchGoogleModels(apiKey);
        break;
      case 'minimax':
        result = await fetchMiniMaxModels(apiKey);
        break;
      default:
        result = { success: false, error: `Unsupported provider: ${provider}` };
    }

    if (result.success && result.models?.length) {
      setCached(normalized, apiKey, result.models);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Provider models] ${normalized}:`, msg);
    return { success: false, error: msg };
  }
}

module.exports = {
  fetchProviderModels,
  CURATED_IDS,
};
