/* eslint-disable no-console */
/**
 * User-configured cloud LLM for vision, PDF transcription, auto-metadata, etc.
 * Replaces on-device Gemma. Uses settings: ai_provider, ai_api_key, ai_model, ai_base_url, ollama_*.
 */
'use strict';

const aiCloud = require('../ai-cloud-service.cjs');
const { MINIMAX_BASE_URL } = require('../minimax-config.cjs');
const database = require('../database.cjs');
const domeOauth = require('../dome-oauth.cjs');

const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';

const VISION_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'minimax', 'dome', 'ollama']);

/**
 * @param {() => import('better-sqlite3').Database extends infer _ ? ReturnType<typeof database.getQueries> : never} getQueries
 */
function resolveConfig(getQueries) {
  const q = getQueries();
  const provider = String(q.getSetting.get('ai_provider')?.value || 'openai').toLowerCase();

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      apiKey: q.getSetting.get('ollama_api_key')?.value || '',
      model: q.getSetting.get('ollama_model')?.value || 'llama3.2',
      ollamaBase: String(q.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    };
  }

  if (provider === 'dome') {
    return {
      provider: 'dome',
      model: q.getSetting.get('ai_model')?.value || 'dome/auto',
    };
  }

  const rawBase = q.getSetting.get('ai_base_url')?.value;
  const openaiBase = rawBase && String(rawBase).trim() ? String(rawBase).trim().replace(/\/$/, '') : 'https://api.openai.com';

  return {
    provider: ['openai', 'anthropic', 'google', 'minimax'].includes(provider) ? provider : 'openai',
    apiKey: q.getSetting.get('ai_api_key')?.value,
    model: q.getSetting.get('ai_model')?.value,
    openaiBase: provider === 'minimax' ? MINIMAX_BASE_URL : openaiBase,
  };
}

/**
 * True if we can run a cloud call (key or ollama / dome session).
 * @param {() => any} getQueries
 */
function isCloudLlmAvailable(getQueries) {
  try {
    const cfg = resolveConfig(getQueries);
    if (cfg.provider === 'ollama') return true;
    if (cfg.provider === 'dome') {
      const row = getQueries().getDomeProviderSessionWithRefresh?.get?.();
      return Boolean(row?.access_token);
    }
    return Boolean(cfg.apiKey && String(cfg.apiKey).trim());
  } catch {
    return false;
  }
}

/**
 * @param {string | null | undefined} stt
 */
function isVisionSupportedProviderId(provider) {
  return VISION_PROVIDERS.has(String(provider || '').toLowerCase());
}

/**
 * @param {{ success?: boolean, broadcast: (ch: string, data: unknown) => void } | null} windowManager
 * @param {Record<string, unknown>} props
 */
function emitAnalytics(windowManager, props) {
  try {
    windowManager?.broadcast?.('analytics:event', { event: 'cloud_llm.call', properties: props });
  } catch {
    /* */
  }
}

/**
 * @param {string} [system]
 * @param {string} userText
 * @param {string[]} imageDataUrls
 * @param {'openai' | 'dome' | 'minimax' | 'ollama'} _style
 * @returns {Array<{ role: string, content: string | unknown[] }>}
 */
function buildOpenAStyleMessages(system, userText, imageDataUrls) {
  const imgs = (imageDataUrls || []).filter(Boolean);
  const userContent = aiCloud.buildOpenAIImageUserContent(userText, imgs);
  const messages = [];
  if (system && String(system).trim()) {
    messages.push({ role: 'system', content: String(system) });
  }
  messages.push({ role: 'user', content: userContent });
  return messages;
}

/**
 * @param {string} [system]
 * @param {string} userText
 * @param {string[]} imageDataUrls
 */
function buildAnthropicStyleMessages(system, userText, imageDataUrls) {
  return buildOpenAStyleMessages(system, userText, imageDataUrls);
}

/**
 * Non-streaming chat for vision / text.
 * @param {{
 *   getQueries: () => any,
 *   system?: string,
 *   user: string,
 *   imageDataUrls?: string[],
 *   json?: boolean,
 *   maxTokens?: number,
 *   task?: string,
 *   windowManager?: { broadcast: (ch: string, data: unknown) => void } | null,
 * }} opts
 * @returns {Promise<string>}
 */
async function generateText(opts) {
  const { getQueries, system, user, imageDataUrls = [], json, maxTokens, task = 'vision', windowManager } = opts;
  const t0 = Date.now();
  const cfg = resolveConfig(getQueries);
  const hasImages = (imageDataUrls || []).length > 0;
  if (hasImages && !isVisionSupportedProviderId(cfg.provider)) {
    throw new Error(
      `Provider "${cfg.provider}" no admite imágenes con la API actual. Usa OpenAI, Anthropic, Google, MiniMax, Dome u Ollama.`
    );
  }
  if (!isCloudLlmAvailable(getQueries)) {
    throw new Error('Configura un proveedor de IA en Ajustes (clave API, Ollama o sesión Dome).');
  }
  const openOpts = { maxTokens: maxTokens || (json ? 1024 : 4096) };
  if (json) openOpts.responseFormat = 'json_object';

  const googleOpts = {
    maxOutputTokens: openOpts.maxTokens,
    responseMimeType: json ? 'application/json' : undefined,
  };
  const anthOpts = { maxTokens: openOpts.maxTokens };

  const messages = hasImages
    ? buildOpenAStyleMessages(system, user, imageDataUrls)
    : (() => {
        const m = [];
        if (system && String(system).trim()) m.push({ role: 'system', content: String(system) });
        m.push({ role: 'user', content: String(user) });
        return m;
      })();

  let out = '';
  let err = null;
  try {
    if (cfg.provider === 'dome') {
      const body = { model: cfg.model, messages };
      if (json) body.response_format = { type: 'json_object' };
      const r = await domeChatCompletions(body);
      out = r;
    } else if (cfg.provider === 'ollama') {
      out = await aiCloud.chatOpenAI(
        messages,
        cfg.apiKey,
        cfg.model,
        cfg.ollamaBase,
        300000,
        openOpts,
      );
    } else if (cfg.provider === 'openai' || cfg.provider === 'minimax') {
      const key = cfg.apiKey;
      if (!key) throw new Error('Falta la clave API en Ajustes');
      if (cfg.provider === 'minimax') {
        out = await aiCloud.chatOpenAI(
          messages,
          key,
          cfg.model || 'MiniMax-M2.5',
          cfg.openaiBase,
          300000,
          openOpts,
        );
      } else {
        out = await aiCloud.chatOpenAI(messages, key, cfg.model, cfg.openaiBase, 300000, openOpts);
      }
    } else if (cfg.provider === 'anthropic') {
      if (!cfg.apiKey) throw new Error('Falta la clave API en Ajustes');
      if (json) {
        // Anthropic: prompt JSON in system, no response_format
        const m2 = hasImages
          ? buildAnthropicStyleMessages(
              `${system || ''}\nResponde solo con un objeto JSON válido, sin markdown.`,
              user,
              imageDataUrls,
            )
          : (() => {
              const m = [];
              m.push({ role: 'user', content: String(user) });
              if (system) m.unshift({ role: 'system', content: String(system) + '\nResponde solo con JSON.' });
              return m;
            })();
        out = await aiCloud.chatAnthropic(m2, cfg.apiKey, cfg.model, anthOpts);
      } else {
        out = await aiCloud.chatAnthropic(messages, cfg.apiKey, cfg.model, anthOpts);
      }
    } else if (cfg.provider === 'google') {
      if (!cfg.apiKey) throw new Error('Falta la clave API en Ajustes');
      out = await aiCloud.chatGoogle(messages, cfg.apiKey, cfg.model, googleOpts);
    } else {
      throw new Error(`Proveedor no soportado: ${cfg.provider}`);
    }
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e));
    throw err;
  } finally {
    emitAnalytics(windowManager, { task, provider: cfg.provider, ms: Date.now() - t0, ok: !err, error: err?.message });
  }

  return String(out || '');
}

/**
 * @param {{ messages: Array<unknown>, model: string, temperature?: number, response_format?: { type: string } }} body
 */
async function domeChatCompletions(body) {
  const db = database;
  const res = await domeOauth.fetchWithDomeAuth(db, `${DOME_PROVIDER_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ temperature: 0.7, ...body }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Dome: ${res.status} ${t}`);
  }
  const data = await res.json();
  const c = data?.choices?.[0]?.message?.content;
  if (c == null) throw new Error('Dome: respuesta vacía');
  return String(c);
}

/**
 * @param {{ messages: any[], model: string }} p
 * @param {(c: { type: string, text?: string }) => void} onChunk
 */
async function domeStreamChatCompletions(p, onChunk) {
  const db = database;
  const res = await domeOauth.fetchWithDomeAuth(db, `${DOME_PROVIDER_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...p, stream: true, temperature: 0.7 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Dome stream: ${res.status} ${t}`);
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new Error('Dome: stream no disponible en este entorno');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        const t = parsed?.choices?.[0]?.delta?.content;
        if (t) {
          full += t;
          onChunk({ type: 'text', text: t });
        }
      } catch {
        /* skip */
      }
    }
  }
  return full;
}

/**
 * @param {Parameters<typeof generateText>[0] & { onChunk: (c: { type: 'text' | 'json_object', text?: string }) => void, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
async function streamGenerate(opts) {
  const { getQueries, system, user, imageDataUrls = [], onChunk, maxTokens, task = 'stream', windowManager } = opts;
  const t0 = Date.now();
  const cfg = resolveConfig(getQueries);
  const hasImages = (imageDataUrls || []).length > 0;
  if (hasImages && !isVisionSupportedProviderId(cfg.provider)) {
    throw new Error(`Provider "${cfg.provider}" no admite imágenes.`);
  }
  if (!isCloudLlmAvailable(getQueries)) {
    throw new Error('Configura un proveedor de IA en Ajustes.');
  }
  const streamOpts = { maxTokens: maxTokens || 1024 };
  const messages = hasImages
    ? buildOpenAStyleMessages(system, user, imageDataUrls)
    : (() => {
        const m = [];
        if (system && String(system).trim()) m.push({ role: 'system', content: String(system) });
        m.push({ role: 'user', content: String(user) });
        return m;
      })();

  const wrap = (data) => {
    if (data?.type === 'text' && data.text) onChunk(data);
  };

  let err = null;
  let full = '';
  try {
    if (cfg.provider === 'dome') {
      full = await domeStreamChatCompletions({ messages, model: cfg.model || 'dome/auto' }, wrap);
    } else if (cfg.provider === 'ollama') {
      full = await aiCloud.streamOpenAI(
        messages,
        cfg.apiKey,
        cfg.model,
        wrap,
        cfg.ollamaBase,
        300000,
        undefined,
        streamOpts,
      );
    } else if (cfg.provider === 'openai' || cfg.provider === 'minimax') {
      const key = cfg.apiKey;
      if (!key) throw new Error('Falta la clave API');
      const model = cfg.model;
      if (cfg.provider === 'minimax') {
        full = await aiCloud.streamOpenAI(
          messages,
          key,
          model || 'MiniMax-M2.5',
          wrap,
          cfg.openaiBase,
          300000,
          undefined,
          streamOpts,
        );
      } else {
        full = await aiCloud.streamOpenAI(
          messages,
          key,
          model,
          wrap,
          cfg.openaiBase,
          300000,
          undefined,
          streamOpts,
        );
      }
    } else if (cfg.provider === 'anthropic') {
      if (!cfg.apiKey) throw new Error('Falta la clave API');
      full = await aiCloud.streamAnthropic(messages, cfg.apiKey, cfg.model, wrap, undefined, streamOpts);
    } else if (cfg.provider === 'google') {
      if (!cfg.apiKey) throw new Error('Falta la clave API');
      full = await aiCloud.streamGoogle(
        messages,
        cfg.apiKey,
        cfg.model,
        wrap,
        undefined,
        { maxOutputTokens: streamOpts.maxTokens },
      );
    } else {
      throw new Error(`Stream no soportado: ${cfg.provider}`);
    }
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e));
    throw err;
  } finally {
    emitAnalytics(windowManager, { task, provider: cfg.provider, ms: Date.now() - t0, ok: !err, error: err?.message });
  }
  return full;
}

/**
 * @param {import('../services/cloud-llm-tasks.cjs')} tasks - lazy ref
 * @param {string} dataUrl
 * @param {string} pageNumber
 * @param {{ getQueries: () => any, windowManager?: any }} ctx
 */
async function transcribePdfPage(dataUrl, pageNumber, ctx) {
  const tasks = require('./cloud-llm-tasks.cjs');
  return tasks.transcribePdfPage(
    (opts) => generateText({ ...opts, getQueries: ctx.getQueries, windowManager: ctx.windowManager }),
    dataUrl,
    pageNumber,
  );
}

/**
 * @param {string} dataUrl
 * @param {string} prompt
 * @param {{ getQueries: () => any, windowManager?: any }} ctx
 */
async function describeImage(dataUrl, prompt, ctx) {
  return generateText({
    getQueries: ctx.getQueries,
    system: 'Eres un asistente de visión. Responde con precisión en el idioma del usuario.',
    user: prompt,
    imageDataUrls: [dataUrl],
    maxTokens: 1024,
    task: 'image_describe',
    windowManager: ctx.windowManager,
  });
}

module.exports = {
  resolveConfig,
  isCloudLlmAvailable,
  isVisionSupportedProviderId,
  generateText,
  streamGenerate,
  transcribePdfPage,
  describeImage,
  buildOpenAStyleMessages,
  emitAnalytics,
};
