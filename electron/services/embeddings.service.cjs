/* eslint-disable no-console */
'use strict';

/**
 * Embeddings service — native HTTP clients (OpenAI, Google Gemini, Ollama).
 * Settings keys (independent from chat): embeddings_provider, embeddings_api_key,
 * embeddings_model, embeddings_base_url.
 */

const {
  getEmbeddingContextTokens,
  clearContextCache,
  DEFAULT_CONTEXT_TOKENS,
} = require('./embedding-context.cjs');
const { readSettingSecret } = require('../core/settings-secrets.cjs');

const EMBEDDINGS_NOT_CONFIGURED = 'EMBEDDINGS_NOT_CONFIGURED';
const EMBED_BATCH = 32;
const MAX_QUERY_CHARS = 16000;
const MAX_EMBED_RETRY_DEPTH = 5;

const SUPPORTED_PROVIDERS = new Set(['openai', 'google', 'ollama']);

/** @type {{ embedQuery: (text: string) => Promise<number[]>, embedDocuments: (texts: string[]) => Promise<number[][]> } | null} */
let _cachedClient = null;
/** @type {string | null} */
let _cachedConfigKey = null;
/** @type {string | null} */
let _activeModelVersion = null;
/** @type {number | null} */
let _activeDim = null;
/** @type {number | null} */
let _activeContextTokens = null;

/**
 * @param {() => import('better-sqlite3').Database['prepare'] extends never ? any : ReturnType<typeof import('../core/database.cjs').getQueries>} getQueries
 */
function defaultGetQueries() {
  const database = require('../core/database.cjs');
  return database.getQueries();
}

/**
 * @param {ReturnType<typeof defaultGetQueries>} queries
 */
async function readEmbeddingsSettings(queries) {
  const provider = String((await queries.getSetting.get('embeddings_provider'))?.value || '').toLowerCase();
  const model = String((await queries.getSetting.get('embeddings_model'))?.value || '').trim();
  const apiKey = await readSettingSecret(queries, 'embeddings_api_key') || '';
  const baseUrl = String(
    (await queries.getSetting.get('embeddings_base_url'))?.value || 'http://127.0.0.1:11434',
  ).replace(/\/$/, '');
  return { provider, model, apiKey, baseUrl };
}

/**
 * @param {ReturnType<typeof defaultGetQueries>} [queries]
 */
async function isConfigured(queries = defaultGetQueries()) {
  const { provider, model, apiKey } = await readEmbeddingsSettings(queries);
  if (!SUPPORTED_PROVIDERS.has(provider) || !model) return false;
  if (provider === 'ollama') return true;
  return Boolean(apiKey);
}

/**
 * @param {{ provider: string, model: string, apiKey: string, baseUrl: string }} cfg
 */
function configKey(cfg) {
  return `${cfg.provider}|${cfg.model}|${cfg.apiKey}|${cfg.baseUrl}`;
}

/**
 * @param {string} model
 * @param {string} text
 * @param {boolean} isQuery
 */
function applyNomicPrefixes(model, text, isQuery) {
  const m = String(model || '').toLowerCase();
  if (!m.includes('nomic')) return text;
  const prefix = isQuery ? 'search_query: ' : 'search_document: ';
  const s = String(text ?? '');
  if (s.startsWith('search_query:') || s.startsWith('search_document:')) return s;
  return prefix + s;
}

/**
 * @param {unknown} err
 */
function isContextLengthError(err) {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('exceeds the context length') ||
    msg.includes('maximum context length') ||
    msg.includes('input length') ||
    msg.includes('context length') ||
    msg.includes('token limit') ||
    msg.includes('too many tokens') ||
    msg.includes('413')
  );
}

/**
 * @param {string} text
 * @param {number} [ratio]
 * @returns {{ left: string, right: string }}
 */
function splitTextHalves(text, ratio = 0.6) {
  const s = String(text ?? '');
  if (s.length <= 1) return { left: s, right: s };
  let cut = Math.max(1, Math.min(s.length - 1, Math.floor(s.length * ratio)));
  const space = s.lastIndexOf(' ', cut);
  if (space > cut * 0.4) cut = space;
  return { left: s.slice(0, cut).trim(), right: s.slice(cut).trim() };
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function averageVectors(a, b) {
  const dim = Math.min(a.length, b.length);
  if (dim === 0) return [];
  const out = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

/**
 * @param {{ embedQuery: (text: string) => Promise<number[]>, embedDocuments: (texts: string[]) => Promise<number[][]> }} client
 * @param {string[]} batch
 * @param {number} [depth]
 * @returns {Promise<number[][]>}
 */
async function embedBatchWithRetry(client, batch, depth = 0) {
  try {
    return await client.embedDocuments(batch);
  } catch (err) {
    if (!isContextLengthError(err) || depth >= MAX_EMBED_RETRY_DEPTH) throw err;

    if (batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      const left = await embedBatchWithRetry(client, batch.slice(0, mid), depth + 1);
      const right = await embedBatchWithRetry(client, batch.slice(mid), depth + 1);
      return left.concat(right);
    }

    const text = batch[0] || '';
    const { left, right } = splitTextHalves(text);
    if (!left || !right) throw err;

    const [vLeft, vRight] = await Promise.all([
      embedBatchWithRetry(client, [left], depth + 1),
      embedBatchWithRetry(client, [right], depth + 1),
    ]);
    return [averageVectors(vLeft[0] || [], vRight[0] || [])];
  }
}

/**
 * @param {{ provider: string, model: string, apiKey: string, baseUrl: string }} cfg
 * @returns {Promise<{ embedQuery: (text: string) => Promise<number[]>, embedDocuments: (texts: string[]) => Promise<number[][]> }>}
 */
async function createEmbeddingsClient(cfg) {
  const { createEmbeddingsClient: createNative } = require('./embeddings-client.cjs');
  return createNative(cfg);
}

/**
 * @param {{ provider: string, model: string, apiKey: string, baseUrl: string }} cfg
 */
async function refreshActiveContext(cfg) {
  try {
    _activeContextTokens = await getEmbeddingContextTokens(cfg);
  } catch (err) {
    console.warn('[embeddings.service] context lookup failed', err?.message || err);
    _activeContextTokens = DEFAULT_CONTEXT_TOKENS;
  }
}

/**
 * @param {ReturnType<typeof defaultGetQueries>} [getQueries]
 */
async function getClient(getQueries = defaultGetQueries) {
  const queries = typeof getQueries === 'function' ? getQueries() : getQueries;
  const cfg = await readEmbeddingsSettings(queries);
  if (!await isConfigured(queries)) {
    throw new Error(EMBEDDINGS_NOT_CONFIGURED);
  }
  const key = configKey(cfg);
  if (!_cachedClient || _cachedConfigKey !== key) {
    _cachedClient = await createEmbeddingsClient(cfg);
    _cachedConfigKey = key;
    _activeModelVersion = `${cfg.provider}:${cfg.model}`;
    _activeContextTokens = null;
  }
  if (_activeContextTokens == null) {
    await refreshActiveContext(cfg);
  }
  return _cachedClient;
}

/**
 * @param {number[]} vec
 */
function toFloat32(vec) {
  return Float32Array.from(vec);
}

/**
 * @param {ReturnType<typeof defaultGetQueries>} [getQueries]
 */
async function probeDimensions(getQueries = defaultGetQueries) {
  const client = await getClient(getQueries);
  const cfg = await readEmbeddingsSettings(typeof getQueries === 'function' ? getQueries() : getQueries);
  const probe = applyNomicPrefixes(cfg.model, 'ping', true);
  const vec = await client.embedQuery(probe);
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Embeddings probe returned empty vector');
  }
  _activeDim = vec.length;
  return _activeDim;
}

function getActiveModelVersion() {
  return _activeModelVersion;
}

function getActiveDimensions() {
  return _activeDim;
}

function getActiveContextTokens() {
  return _activeContextTokens;
}

/**
 * @param {ReturnType<typeof defaultGetQueries>} [getQueries]
 */
async function getActiveContextTokensSafe(getQueries = defaultGetQueries) {
  if (_activeContextTokens != null) return _activeContextTokens;
  const queries = typeof getQueries === 'function' ? getQueries() : getQueries;
  const cfg = await readEmbeddingsSettings(queries);
  if (!await isConfigured(queries)) return DEFAULT_CONTEXT_TOKENS;
  await getClient(getQueries);
  return _activeContextTokens ?? DEFAULT_CONTEXT_TOKENS;
}

/**
 * @param {string[]} texts
 * @param {ReturnType<typeof defaultGetQueries>} [getQueries]
 * @returns {Promise<Float32Array[]>}
 */
async function embedDocuments(texts, getQueries = defaultGetQueries) {
  if (!await isConfigured(typeof getQueries === 'function' ? getQueries() : getQueries)) {
    throw new Error(EMBEDDINGS_NOT_CONFIGURED);
  }
  const queries = typeof getQueries === 'function' ? getQueries() : getQueries;
  const cfg = await readEmbeddingsSettings(queries);
  const client = await getClient(getQueries);
  const inputs = (texts || []).map((t) => applyNomicPrefixes(cfg.model, t, false));
  if (inputs.length === 0) return [];

  /** @type {Float32Array[]} */
  const out = [];
  for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
    const batch = inputs.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatchWithRetry(client, batch);
    for (const v of vectors) {
      out.push(toFloat32(v));
    }
  }

  if (_activeDim == null && out.length > 0) {
    _activeDim = out[0].length;
  }
  if (_activeModelVersion == null) {
    _activeModelVersion = `${cfg.provider}:${cfg.model}`;
  }
  return out;
}

/**
 * @param {string} text
 * @param {ReturnType<typeof defaultGetQueries>} [getQueries]
 * @returns {Promise<Float32Array>}
 */
async function embedQuery(text, getQueries = defaultGetQueries) {
  if (!await isConfigured(typeof getQueries === 'function' ? getQueries() : getQueries)) {
    throw new Error(EMBEDDINGS_NOT_CONFIGURED);
  }
  const queries = typeof getQueries === 'function' ? getQueries() : getQueries;
  const cfg = await readEmbeddingsSettings(queries);
  const client = await getClient(getQueries);
  const ctxTokens = _activeContextTokens ?? DEFAULT_CONTEXT_TOKENS;
  const maxQueryChars = Math.min(MAX_QUERY_CHARS, Math.floor(ctxTokens * 3.3 * 0.9));
  const q = String(text || '').slice(0, maxQueryChars);
  const input = applyNomicPrefixes(cfg.model, q, true);
  let vec;
  try {
    vec = await client.embedQuery(input);
  } catch (err) {
    if (!isContextLengthError(err) || input.length <= 32) throw err;
    const { left, right } = splitTextHalves(input);
    const [vLeft, vRight] = await Promise.all([
      client.embedQuery(left),
      client.embedQuery(right),
    ]);
    vec = averageVectors(vLeft, vRight);
  }
  const f = toFloat32(vec);
  _activeDim = f.length;
  if (_activeModelVersion == null) {
    _activeModelVersion = `${cfg.provider}:${cfg.model}`;
  }
  return f;
}

async function resetPipeline() {
  _cachedClient = null;
  _cachedConfigKey = null;
}

function invalidateCache() {
  _cachedClient = null;
  _cachedConfigKey = null;
  _activeModelVersion = null;
  _activeDim = null;
  _activeContextTokens = null;
  clearContextCache();
}

function floatsToBlob(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function blobToFloats(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

/**
 * Test connectivity without persisting settings.
 * @param {{ provider: string, model: string, apiKey?: string, baseUrl?: string }} cfg
 */
async function testConfig(cfg) {
  const provider = String(cfg.provider || '').toLowerCase();
  const model = String(cfg.model || '').trim();
  const apiKey = String(cfg.apiKey || '').trim();
  const baseUrl = String(cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  if (!SUPPORTED_PROVIDERS.has(provider) || !model) {
    throw new Error('Invalid embeddings provider or model');
  }
  if (provider !== 'ollama' && !apiKey) {
    throw new Error('API key required');
  }
  const t0 = Date.now();
  const client = await createEmbeddingsClient({ provider, model, apiKey, baseUrl });
  const probe = applyNomicPrefixes(model, 'ping', true);
  const vec = await client.embedQuery(probe);
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Empty embedding vector');
  }
  return {
    ok: true,
    dimensions: vec.length,
    modelVersion: `${provider}:${model}`,
    latencyMs: Date.now() - t0,
  };
}

function resetForTests() {
  invalidateCache();
}

/** @deprecated — no-op; kept for callers that expected worker warmup */
function initWorker() {}

/** @deprecated — no-op */
function disposeWorker() {}

/** @deprecated — no-op */
function configureTransformersEnv() {}

module.exports = {
  EMBEDDINGS_NOT_CONFIGURED,
  configureTransformersEnv,
  initWorker,
  disposeWorker,
  embedDocuments,
  embedQuery,
  floatsToBlob,
  blobToFloats,
  resetPipeline,
  resetForTests,
  invalidateCache,
  isConfigured,
  readEmbeddingsSettings,
  createEmbeddingsClient,
  probeDimensions,
  testConfig,
  getActiveModelVersion,
  getActiveDimensions,
  getActiveContextTokens,
  getActiveContextTokensSafe,
  defaultGetQueries,
  EMBED_BATCH,
  MAX_QUERY_CHARS,
  SUPPORTED_PROVIDERS,
  embedBatchWithRetry,
  isContextLengthError,
};
