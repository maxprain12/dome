/* eslint-disable no-console */
'use strict';

const http = require('http');
const https = require('https');

/** Conservative fallback (~all-minilm) when provider lookup fails. */
const DEFAULT_CONTEXT_TOKENS = 384;

/** @type {Map<string, { tokens: number, at: number }>} */
const cache = new Map();

const KNOWN_CONTEXT_TOKENS = {
  openai: {
    'text-embedding-3-small': 8191,
    'text-embedding-3-large': 8191,
    'text-embedding-ada-002': 8191,
  },
  google: {
    'text-embedding-004': 2048,
    'gemini-embedding-001': 8192,
    'embedding-001': 2048,
  },
  ollama: {
    'nomic-embed-text': 8192,
    'mxbai-embed-large': 512,
    'all-minilm': 256,
    'bge-m3': 8192,
    'snowflake-arctic-embed': 512,
  },
};

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, apiKey?: string }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
function httpJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    const bodyStr = options.body != null ? JSON.stringify(options.body) : null;
    const req = protocol.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
              return;
            }
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || data}`));
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * @param {string} model
 * @param {Record<string, unknown>} modelInfo
 * @returns {number | null}
 */
function extractOllamaContextLength(model, modelInfo) {
  if (!modelInfo || typeof modelInfo !== 'object') return null;
  const direct = Number(modelInfo.context_length);
  if (Number.isFinite(direct) && direct > 0) return direct;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') || key === 'context_length') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const base = String(model || '').split(':')[0].toLowerCase();
  for (const [known, tokens] of Object.entries(KNOWN_CONTEXT_TOKENS.ollama)) {
    if (base.includes(known)) return tokens;
  }
  return null;
}

/**
 * @param {{ provider: string, model: string, baseUrl?: string, apiKey?: string }} cfg
 * @returns {Promise<number>}
 */
async function getEmbeddingContextTokens(cfg) {
  const provider = String(cfg.provider || '').toLowerCase();
  const model = String(cfg.model || '').trim();
  if (!provider || !model) return DEFAULT_CONTEXT_TOKENS;

  const cacheKey = `${provider}:${model}:${cfg.baseUrl || ''}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit.tokens;

  let tokens = DEFAULT_CONTEXT_TOKENS;

  try {
    if (provider === 'ollama') {
      const baseUrl = String(cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const show = await httpJson(`${baseUrl}/api/show`, {
        method: 'POST',
        body: { model, verbose: false },
        apiKey: cfg.apiKey,
      });
      const fromShow = extractOllamaContextLength(model, show.model_info);
      if (fromShow) tokens = fromShow;
    } else if (provider === 'google') {
      const known = KNOWN_CONTEXT_TOKENS.google[model];
      if (known) {
        tokens = known;
      } else if (cfg.apiKey) {
        const res = await httpJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(cfg.apiKey)}`,
        );
        const limit = Number(res.inputTokenLimit);
        if (Number.isFinite(limit) && limit > 0) tokens = limit;
      }
    } else if (provider === 'openai') {
      const known = KNOWN_CONTEXT_TOKENS.openai[model];
      if (known) tokens = known;
    }
  } catch (err) {
    console.warn('[embedding-context] lookup failed', provider, model, err?.message || err);
    const catalog = KNOWN_CONTEXT_TOKENS[provider];
    if (catalog) {
      const base = model.split(':')[0].toLowerCase();
      for (const [id, ctx] of Object.entries(catalog)) {
        if (base.includes(id)) {
          tokens = ctx;
          break;
        }
      }
    }
  }

  cache.set(cacheKey, { tokens, at: Date.now() });
  return tokens;
}

function clearContextCache() {
  cache.clear();
}

module.exports = {
  DEFAULT_CONTEXT_TOKENS,
  KNOWN_CONTEXT_TOKENS,
  getEmbeddingContextTokens,
  clearContextCache,
  extractOllamaContextLength,
};
