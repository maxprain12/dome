'use strict';

/** Conservative local-chat fallback when the server does not report a window. */
const LOCAL_CHAT_CONTEXT_FALLBACK = 32_768;

/**
 * @param {string} provider
 * @returns {string}
 */
function contextWindowSettingKey(provider) {
  return `ai_context_window_${String(provider || '').trim().toLowerCase()}`;
}

/**
 * @param {unknown} value
 * @returns {number} 0 when missing or invalid
 */
function parseContextWindow(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Read a context length from a provider model row (OpenAI-compat / LM Studio / vLLM).
 * @param {unknown} row
 * @returns {number}
 */
function extractContextWindowFromRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const rec = /** @type {Record<string, unknown>} */ (row);
  const keys = [
    'max_model_len',
    'max_context_length',
    'context_length',
    'context_window',
    'max_seq_len',
    'n_ctx_train',
  ];
  for (const key of keys) {
    const n = parseContextWindow(rec[key]);
    if (n > 0) return n;
  }
  const nested = rec.loaded_instance || rec.instance || rec.meta;
  if (nested && typeof nested === 'object') {
    return extractContextWindowFromRow(nested);
  }
  return 0;
}

/**
 * @param {{ getSetting: { get: (key: string) => { value?: string } | undefined }, setSetting: { run: (key: string, value: string, updatedAt: number) => void } }} queries
 * @param {string} provider
 * @param {unknown} tokens
 */
function persistContextWindow(queries, provider, tokens) {
  const n = parseContextWindow(tokens);
  const id = String(provider || '').trim().toLowerCase();
  if (!n || !id || !queries?.setSetting) return;
  queries.setSetting.run(contextWindowSettingKey(id), String(n), Date.now());
}

/**
 * @param {{ getSetting: { get: (key: string) => { value?: string } | undefined } }} queries
 * @param {string} provider
 * @returns {number}
 */
function readPersistedContextWindow(queries, provider) {
  if (!queries?.getSetting) return 0;
  const row = queries.getSetting.get(contextWindowSettingKey(provider));
  return parseContextWindow(row?.value);
}

/**
 * Persist the listed window for the currently selected model, if we have one.
 * @param {{ getSetting: { get: (key: string) => { value?: string } | undefined }, setSetting: { run: (key: string, value: string, updatedAt: number) => void } }} queries
 * @param {string} provider
 * @param {Array<{ id?: string, name?: string, contextWindow?: number }>} models
 */
function persistIfCurrentModel(queries, provider, models) {
  if (!queries?.getSetting || !Array.isArray(models)) return;
  const modelKey = provider === 'ollama' ? 'ollama_model' : 'ai_model';
  const current = String(queries.getSetting.get(modelKey)?.value || '').trim();
  if (!current) return;
  const match = models.find((m) => m && (m.id === current || m.name === current));
  if (match && parseContextWindow(match.contextWindow) > 0) {
    persistContextWindow(queries, provider, match.contextWindow);
  }
}

/**
 * POST /api/show for a chat model (Ollama).
 * @param {string} baseUrl
 * @param {string} model
 * @param {string} [apiKey]
 * @returns {Promise<number>}
 */
async function fetchOllamaChatContextWindow(baseUrl, model, apiKey) {
  const name = String(model || '').trim();
  if (!name) return 0;
  const root = String(baseUrl || 'http://127.0.0.1:11434')
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && String(apiKey).trim()) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  try {
    const res = await fetch(`${root}/api/show`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: name, verbose: false }),
    });
    if (!res.ok) return 0;
    const json = /** @type {Record<string, unknown>} */ (await res.json());
    const { extractOllamaContextLength } = require('../services/embedding-context.cjs');
    return parseContextWindow(extractOllamaContextLength(name, json.model_info));
  } catch {
    return 0;
  }
}

/**
 * LM Studio native catalog (`/api/v0/models`) carries `max_context_length`.
 * @param {string} openAiBaseUrl
 * @param {Record<string, string>} [headers]
 * @returns {Promise<Map<string, number>>}
 */
async function fetchLmStudioContextById(openAiBaseUrl, headers = {}) {
  const origin = String(openAiBaseUrl || '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
  if (!origin) return new Map();
  try {
    const res = await fetch(`${origin}/api/v0/models`, { headers });
    if (!res.ok) return new Map();
    const json = /** @type {Record<string, unknown>} */ (await res.json());
    const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const rec = /** @type {Record<string, unknown>} */ (row);
      const id = typeof rec.id === 'string' ? rec.id : typeof rec.name === 'string' ? rec.name : '';
      const ctx = extractContextWindowFromRow(rec);
      if (id && ctx > 0) map.set(id, ctx);
    }
    return map;
  } catch {
    return new Map();
  }
}

module.exports = {
  LOCAL_CHAT_CONTEXT_FALLBACK,
  contextWindowSettingKey,
  parseContextWindow,
  extractContextWindowFromRow,
  persistContextWindow,
  readPersistedContextWindow,
  persistIfCurrentModel,
  fetchOllamaChatContextWindow,
  fetchLmStudioContextById,
};
