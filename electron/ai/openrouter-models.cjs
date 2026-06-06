/* eslint-disable no-console */
/**
 * Fetch and normalize OpenRouter /v1/models with short-lived in-memory cache.
 */
'use strict';

const { OPENROUTER_MODELS_URL } = require('./openrouter-config.cjs');

/** Popular model ids — surfaced as recommended when present in the API list. */
const OPENROUTER_CURATED_MODEL_IDS = new Set([
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.5',
  'openai/gpt-4o',
  'openai/gpt-5.2',
  'google/gemini-2.5-flash-preview-05-20',
  'google/gemini-2.5-pro-preview',
  'meta-llama/llama-4-maverick',
  'deepseek/deepseek-chat',
  'mistralai/mistral-small-3.2-24b-instruct',
]);

const TTL_MS = 15 * 60 * 1000;

/** @type {{ apiKey: string, at: number, models: NormalizedModel[] }} */
let cache = { apiKey: '', at: 0, models: [] };

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
 * Derive input modalities from OpenRouter architecture.modality string.
 * @param {string} modality
 * @returns {'text'|'image'[]}
 */
function inputFromModality(modality) {
  const m = String(modality || '').toLowerCase();
  const out = ['text'];
  if (m.includes('image') || m.includes('vision') || m.includes('multimodal')) {
    out.push('image');
  }
  return out;
}

/**
 * @param {unknown} entry
 * @returns {NormalizedModel | null}
 */
function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const e = /** @type {Record<string, unknown>} */ (entry);
  const id = typeof e.id === 'string' ? e.id : '';
  if (!id) return null;
  const name = typeof e.name === 'string' && e.name.trim() ? e.name : id;
  const arch = e.architecture && typeof e.architecture === 'object' ? /** @type {Record<string, unknown>} */ (e.architecture) : {};
  const modality = typeof arch.modality === 'string' ? arch.modality : '';
  const ctx = Number(e.context_length);
  const contextWindow = Number.isFinite(ctx) && ctx > 0 ? ctx : 128000;
  const description = typeof e.description === 'string' ? e.description : undefined;
  const curated = OPENROUTER_CURATED_MODEL_IDS.has(id);
  return {
    id,
    name,
    contextWindow,
    reasoning: modality.includes('reasoning') || id.includes('o1') || id.includes('o3') || id.includes('r1'),
    input: inputFromModality(modality),
    maxTokens: 8192,
    recommended: curated,
    description,
    api: 'openai-completions',
  };
}

/**
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, models?: NormalizedModel[], error?: string }>}
 */
async function fetchOpenRouterModels(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { success: false, error: 'OpenRouter API key is required.' };
  }

  const now = Date.now();
  if (cache.apiKey === key && cache.models.length > 0 && now - cache.at < TTL_MS) {
    return { success: true, models: cache.models };
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `OpenRouter models failed (${res.status}): ${text.slice(0, 500)}`,
      };
    }

    const json = /** @type {Record<string, unknown>} */ (await res.json());
    const data = json.data;
    if (!Array.isArray(data)) {
      return { success: false, error: 'Unexpected OpenRouter response: missing data array.' };
    }

    const models = [];
    for (const row of data) {
      const norm = normalizeEntry(row);
      if (norm) models.push(norm);
    }

    models.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    cache = { apiKey: key, at: now, models };
    return { success: true, models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[OpenRouter models]', msg);
    return { success: false, error: msg };
  }
}

module.exports = {
  fetchOpenRouterModels,
  OPENROUTER_CURATED_MODEL_IDS,
};
