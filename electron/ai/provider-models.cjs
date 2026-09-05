/* eslint-disable no-console */
/**
 * Fetch and normalize provider model lists with short-lived in-memory cache.
 * Supports OpenAI, Anthropic, Google, MiniMax; delegates OpenRouter to openrouter-models.cjs.
 */
'use strict';

const crypto = require('crypto');
const { fetchOpenRouterModels } = require('./openrouter-models.cjs');
const { listOpenCodeModels } = require('./opencode-models.cjs');
const {
  LOCAL_CHAT_CONTEXT_FALLBACK,
  extractContextWindowFromRow,
  fetchLmStudioContextById,
} = require('./context-window.cjs');

const TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, { at: number, models: NormalizedModel[] }>} */
const cache = new Map();

/** Static recommended ids per provider (merged when present in API response). */
const CURATED_IDS = {
  openai: new Set([
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.6',
    'gpt-5.2',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-oss-120b',
  ]),
  anthropic: new Set([
    'claude-fable-5',
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
  ]),
  google: new Set(['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']),
  minimax: new Set(['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5-highspeed']),
};

/**
 * @typedef {object} NormalizedModel
 * @property {string} id
 * @property {string} name
 * @property {number} contextWindow
 * @property {boolean} reasoning
 * @property {Array<'text'|'image'|'video'>} input
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
function cacheKey(provider, apiKey, extra = '') {
  const hash = crypto
    .createHash('sha256')
    .update(`${String(apiKey || '')}|${String(extra || '')}`)
    .digest('hex')
    .slice(0, 16);
  return `${provider}:${hash}`;
}

/**
 * @param {string} provider
 * @param {string} key
 * @returns {NormalizedModel[] | null}
 */
function getCached(provider, key, extra = '') {
  const entry = cache.get(cacheKey(provider, key, extra));
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
function setCached(provider, key, models, extra = '') {
  cache.set(cacheKey(provider, key, extra), { at: Date.now(), models });
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
  if (!isLocalCompatChatModel(id)) return false;
  return (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('chatgpt-')
  );
}

/**
 * Chat-capable ids for local OpenAI-compat servers (vLLM, LM Studio).
 * Only drop obvious non-chat endpoints — local ids are GGUF names, HF repos, etc.
 * @param {string} id
 * @returns {boolean}
 */
function isLocalCompatChatModel(id) {
  const lower = String(id || '').toLowerCase();
  if (!lower.trim()) return false;
  return !(
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('embed') ||
    lower.includes('dall-e') ||
    lower.includes('moderation')
  );
}

/**
 * Unwrap Node fetch / undici "fetch failed" into a reachable-server message.
 * @param {unknown} err
 * @param {string} provider
 * @param {string} url
 * @returns {string}
 */
function isOpaqueConnectionMessage(text) {
  return /^(connection error\.?|fetch failed)$/i.test(String(text || '').trim());
}

function formatLocalCompatFetchError(err, provider, url) {
  const error = err && typeof err === 'object' ? err : { message: String(err) };
  const cause = 'cause' in error ? error.cause : undefined;
  const causeObj = cause && typeof cause === 'object' ? cause : null;
  const code = (causeObj && 'code' in causeObj ? causeObj.code : null) || ('code' in error ? error.code : '') || '';
  const label =
    provider === 'lmstudio' ? 'LM Studio' : provider === 'vllm' ? 'vLLM' : provider === 'ollama' ? 'Ollama' : provider;
  const message = 'message' in error && error.message ? String(error.message) : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `Could not resolve the host for ${url}.`;
  }
  if (code === 'ETIMEDOUT' || error.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `Timed out connecting to ${label} at ${url}.`;
  }
  if (code === 'ECONNRESET') {
    return `Connection reset by ${label} at ${url}.`;
  }
  if (code === 'ECONNREFUSED' || code === 'UND_ERR_SOCKET' || isOpaqueConnectionMessage(message)) {
    return `${label} is not reachable at ${url}. Start the local server and try again.`;
  }
  const detail =
    (causeObj && 'message' in causeObj && causeObj.message) ||
    (causeObj && 'code' in causeObj && causeObj.code) ||
    message ||
    String(err);
  if (detail === 'fetch failed' && causeObj && 'code' in causeObj) {
    return `Could not reach ${label} at ${url} (${causeObj.code}).`;
  }
  return `Could not reach ${label} at ${url}: ${detail}`;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isMiniMaxChatModel(id) {
  const lower = id.toLowerCase();
  if (lower.includes('hailuo') || lower.includes('music') || lower.includes('speech') || lower.includes('tts')) {
    return false;
  }
  if (lower.includes('video') && !/^minimax-m3$/i.test(id)) return false;
  if (lower.includes('image') && !/^minimax-m3$/i.test(id)) return false;
  return lower.startsWith('minimax-') || lower.startsWith('m2-') || lower === 'abab';
}

/**
 * @param {string} id
 * @returns {Array<'text'|'image'|'video'>}
 */
function minimaxInputForModel(id) {
  if (/^minimax-m3$/i.test(id)) return ['text', 'image', 'video'];
  return ['text'];
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
 * @param {string | undefined} baseUrl
 * @param {string} fallback
 * @returns {string}
 */
function normalizeOpenAiCompatBaseUrl(baseUrl, fallback) {
  const raw = String(baseUrl || fallback || '').trim().replace(/\/$/, '');
  if (!raw) return fallback;
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

/**
 * GET {baseUrl}/models for local OpenAI-compatible servers (vLLM, LM Studio).
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchOpenAiCompatModels(apiKey, baseUrl, provider = 'local') {
  const root = normalizeOpenAiCompatBaseUrl(baseUrl, '');
  if (!root) {
    return { success: false, error: 'Base URL is required.' };
  }
  /** @type {Record<string, string>} */
  const headers = {};
  if (apiKey && String(apiKey).trim()) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  let res;
  try {
    res = await fetch(`${root}/models`, { headers });
  } catch (err) {
    return { success: false, error: formatLocalCompatFetchError(err, provider, root) };
  }
  if (!res.ok) {
    const text = await res.text();
    const label = provider === 'lmstudio' ? 'LM Studio' : provider === 'vllm' ? 'vLLM' : provider;
    return {
      success: false,
      error: `${label} returned ${res.status} from ${root}/models: ${text.slice(0, 400)}`,
    };
  }
  const json = /** @type {Record<string, unknown>} */ (await res.json());
  const rawList = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.models)
      ? json.models
      : [];
  const models = [];
  for (const row of rawList) {
    if (typeof row === 'string') {
      if (!isLocalCompatChatModel(row)) continue;
      models.push(makeModel(row, row, {
        api: 'openai-completions',
        contextWindow: LOCAL_CHAT_CONTEXT_FALLBACK,
      }));
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    const id = typeof rec.id === 'string' ? rec.id : typeof rec.name === 'string' ? rec.name : '';
    if (!id || !isLocalCompatChatModel(id)) continue;
    const displayName = typeof rec.display_name === 'string' && rec.display_name.trim() ? rec.display_name : id;
    const fromRow = extractContextWindowFromRow(rec);
    models.push(makeModel(id, displayName, {
      api: 'openai-completions',
      contextWindow: fromRow > 0 ? fromRow : LOCAL_CHAT_CONTEXT_FALLBACK,
    }));
  }

  if (provider === 'lmstudio') {
    const byId = await fetchLmStudioContextById(root, headers);
    for (const model of models) {
      const ctx = byId.get(model.id);
      if (ctx && ctx > 0) model.contextWindow = ctx;
    }
  }

  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
function anthropicAuthHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  const headers = {
    'anthropic-version': '2023-06-01',
  };
  // OAuth tokens (Claude Pro/Max) use Bearer + oauth beta; API keys use x-api-key.
  if (key.includes('sk-ant-oat')) {
    headers.Authorization = `Bearer ${key}`;
    headers['anthropic-beta'] = 'oauth-2025-04-20';
  } else {
    headers['x-api-key'] = key;
  }
  return headers;
}

async function fetchAnthropicModels(apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: anthropicAuthHeaders(apiKey),
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
 * Normalize a single Google API model row into a NormalizedModel, or return null to skip.
 * @param {unknown} row
 * @param {Set<string>} curated
 * @returns {NormalizedModel | null}
 */
function normalizeGoogleModelRow(row, curated) {
  if (!row || typeof row !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const methods = Array.isArray(r.supportedGenerationMethods) ? r.supportedGenerationMethods : [];
  if (!methods.includes('generateContent')) return null;
  const rawName = typeof r.name === 'string' ? r.name : '';
  const id = rawName.replace(/^models\//, '');
  if (!id) return null;
  const displayName = typeof r.displayName === 'string' ? r.displayName : id;
  const ctx = Number(r.inputTokenLimit);
  const input = /** @type {Array<'text'|'image'>} */ (['text']);
  if (String(r.description || '').toLowerCase().includes('vision') || id.includes('vision')) {
    input.push('image');
  }
  return makeModel(id, displayName, {
    curated: curated.has(id),
    contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : 1000000,
    api: 'google-generative',
    description: typeof r.description === 'string' ? r.description : undefined,
  });
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
    const model = normalizeGoogleModelRow(row, curated);
    if (model) models.push(model);
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
    models.push(makeModel(id, id, {
      curated: curated.has(id),
      api: 'openai-completions',
      input: minimaxInputForModel(id),
      contextWindow: /^minimax-m3$/i.test(id) ? 1000000 : 204800,
      recommended: /^minimax-m3$/i.test(id) || curated.has(id),
    }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { success: true, models };
}

const DOME_MODELS = [
  makeModel('dome/auto', 'Dome Auto', { curated: true, api: 'openai-completions' }),
];

/**
 * Plan-filtered model list for the Dome provider. The catalog lives in
 * dome-provider (`model-catalog.json`) and is served per-plan by
 * `GET /api/v1/me/quota` (`models: [{ id, displayName, multiplier, available }]`).
 * Falls back to `dome/auto` when not connected or on any error.
 * @param {object} [database]
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchDomeModels(database) {
  if (!database) return { success: true, models: DOME_MODELS };
  try {
    const domeOauth = require('../auth/dome-oauth.cjs');
    const session = await domeOauth.getOrRefreshSession(database);
    if (!session?.connected || !session?.accessToken) {
      return { success: true, models: DOME_MODELS };
    }
    const cached = getCached('dome', session.accessToken);
    if (cached) return { success: true, models: cached };

    const res = await domeOauth.fetchWithDomeAuth(
      database,
      `${domeOauth.getDomeProviderBaseUrl()}/api/v1/me/quota`,
    );
    if (!res.ok) return { success: true, models: DOME_MODELS };
    const json = /** @type {Record<string, unknown>} */ (await res.json());
    const planModels = Array.isArray(json.models) ? json.models : [];
    const models = [...DOME_MODELS];
    for (const row of planModels) {
      if (!row || typeof row !== 'object') continue;
      const r = /** @type {Record<string, unknown>} */ (row);
      const id = typeof r.id === 'string' ? r.id : '';
      if (!id || r.available !== true) continue;
      const displayName = typeof r.displayName === 'string' ? r.displayName : id;
      const multiplier = Number(r.multiplier);
      models.push(makeModel(id, displayName, {
        api: 'openai-completions',
        description: Number.isFinite(multiplier) && multiplier > 0 ? `Créditos ×${multiplier}` : undefined,
      }));
    }
    if (models.length > DOME_MODELS.length) {
      setCached('dome', session.accessToken, models);
    }
    return { success: true, models };
  } catch (err) {
    console.warn('[Provider models] dome:', err instanceof Error ? err.message : String(err));
    return { success: true, models: DOME_MODELS };
  }
}

/**
 * @param {string} provider
 * @param {{ apiKey?: string, database?: object }} [options]
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
/**
 * Resolve a usable auth token for subscription providers (same discovery as API).
 * @param {string} provider
 * @param {string} apiKey
 * @param {object} [database]
 */
async function resolveListAuthToken(provider, apiKey, database) {
  if (apiKey) return apiKey;
  if (!database) return '';
  try {
    if (provider === 'claude-oauth' || provider === 'anthropic') {
      if (provider === 'claude-oauth') {
        const claudeOAuth = require('../auth/claude-oauth.cjs');
        const { token } = await claudeOAuth.getAccessToken(database);
        return token || '';
      }
    }
    if (provider === 'openai-codex') {
      const openaiCodexOAuth = require('../auth/openai-codex-oauth.cjs');
      const { token } = await openaiCodexOAuth.getAccessToken(database);
      return token || '';
    }
  } catch (err) {
    console.warn(`[Provider models] auth for ${provider}:`, err instanceof Error ? err.message : err);
  }
  return '';
}

async function fetchProviderModels(provider, options = {}) {
  const normalized = String(provider || '').trim().toLowerCase();
  let apiKey = String(options.apiKey || '').trim();

  if (normalized === 'dome') {
    return fetchDomeModels(options.database);
  }

  if (normalized === 'opencode' || normalized === 'opencode-go') {
    try {
      const models = await listOpenCodeModels(normalized);
      return { success: true, models };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Provider models] ${normalized}:`, msg);
      return { success: false, error: msg };
    }
  }

  if (normalized === 'openrouter') {
    return fetchOpenRouterModels(apiKey);
  }

  if (normalized === 'ollama') {
    return { success: false, error: 'Use ollama:list-models for Ollama.' };
  }

  if (normalized === 'vllm' || normalized === 'lmstudio') {
    const { DEFAULT_BASE_URLS } = require('./model-factory.cjs');
    const url = options.baseUrl || DEFAULT_BASE_URLS[normalized];
    try {
      const result = await fetchOpenAiCompatModels(apiKey, url, normalized);
      if (result.success && result.models?.length) {
        setCached(normalized, apiKey, result.models, url);
      }
      if (!result.success) {
        console.warn(`[Provider models] ${normalized}:`, result.error);
      }
      return result;
    } catch (err) {
      const msg = formatLocalCompatFetchError(err, normalized, url);
      console.warn(`[Provider models] ${normalized}:`, msg);
      return { success: false, error: msg };
    }
  }

  // Subscription providers reuse the same remote catalogs as their API counterparts.
  const catalogProvider =
    normalized === 'claude-oauth' ? 'anthropic' : normalized === 'openai-codex' ? 'openai' : normalized;

  const cloudProviders = ['openai', 'anthropic', 'google', 'minimax', 'claude-oauth', 'openai-codex'];
  if (!cloudProviders.includes(normalized)) {
    return { success: false, error: `Unsupported provider: ${provider}` };
  }

  if (!apiKey && (normalized === 'claude-oauth' || normalized === 'openai-codex')) {
    apiKey = await resolveListAuthToken(normalized, apiKey, options.database);
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required.' };
  }

  const cached = getCached(catalogProvider, apiKey);
  if (cached) {
    return { success: true, models: cached };
  }

  try {
    let result;
    switch (catalogProvider) {
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
      setCached(catalogProvider, apiKey, result.models);
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
  isLocalCompatChatModel,
  formatLocalCompatFetchError,
  fetchOpenAiCompatModels,
};
