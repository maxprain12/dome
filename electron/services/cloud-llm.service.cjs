/* eslint-disable no-console */
/**
 * User-configured cloud LLM for vision, PDF transcription, auto-metadata, etc.
 * Replaces on-device Gemma. Uses settings: ai_provider, ai_api_key, ai_model, ai_base_url, ollama_*.
 */
'use strict';

const llmService = require('../ai/llm-service.cjs');
const { MINIMAX_BASE_URL } = require('../ai/minimax-config.cjs');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const { readSettingSecret } = require('../core/settings-secrets.cjs');

const VISION_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'minimax',
  'dome',
  'ollama',
  'openrouter',
  'copilot',
  'deepseek',
  'moonshot',
  'qwen',
]);

/**
 * @param {() => any} getQueries
 */
async function resolveConfig(getQueries) {
  const q = getQueries();
  const provider = String((await q.getSetting.get('ai_provider'))?.value || 'openai').toLowerCase();

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      apiKey: (await readSettingSecret(q, 'ollama_api_key')) || '',
      model: (await q.getSetting.get('ollama_model'))?.value || 'llama3.2',
      ollamaBase: String((await q.getSetting.get('ollama_base_url'))?.value || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    };
  }

  if (provider === 'dome') {
    const row = await q.getDomeProviderSessionWithRefresh?.get?.();
    return {
      provider: 'dome',
      model: (await q.getSetting.get('ai_model'))?.value || 'dome/auto',
      apiKey: row?.access_token || '',
      openaiBase: `${getDomeProviderBaseUrl()}/api/v1`,
    };
  }

  if (provider === 'copilot') {
    return {
      provider: 'copilot',
      apiKey: (await readSettingSecret(q, 'copilot_github_token')) || '',
      model: (await q.getSetting.get('ai_model'))?.value || 'gpt-4.1',
      openaiBase: 'https://api.individual.githubcopilot.com',
    };
  }

  const { DEFAULT_BASE_URLS } = require('../ai/model-factory.cjs');
  const { MINIMAX_ANTHROPIC_BASE_URL } = require('../ai/minimax-config.cjs');
  const { readProviderBaseUrl } = require('../ai/provider-keys.cjs');
  const customBase = await readProviderBaseUrl(q, provider);

  const supported = [
    'openai',
    'anthropic',
    'google',
    'minimax',
    'openrouter',
    'deepseek',
    'moonshot',
    'qwen',
  ];
  const resolvedProvider = supported.includes(provider) ? provider : 'openai';

  let openaiBase = customBase || 'https://api.openai.com';
  if (resolvedProvider === 'minimax') openaiBase = MINIMAX_ANTHROPIC_BASE_URL;
  else if (resolvedProvider === 'openrouter') openaiBase = 'https://openrouter.ai/api/v1';
  else if (DEFAULT_BASE_URLS[resolvedProvider]) openaiBase = DEFAULT_BASE_URLS[resolvedProvider];

  return {
    provider: resolvedProvider,
    apiKey: await require('../ai/provider-keys.cjs').readProviderApiKey(q, resolvedProvider),
    model: (await q.getSetting.get('ai_model'))?.value,
    openaiBase,
  };
}

/**
 * True if we can run a cloud call (key or ollama / dome session).
 * @param {() => any} getQueries
 */
async function isCloudLlmAvailable(getQueries) {
  try {
    const cfg = await resolveConfig(getQueries);
    if (cfg.provider === 'ollama') return true;
    if (cfg.provider === 'dome') {
      const row = await getQueries().getDomeProviderSessionWithRefresh?.get?.();
      return Boolean(row?.access_token);
    }
    if (cfg.provider === 'copilot') {
      return Boolean(await readSettingSecret(getQueries(), 'copilot_github_token'));
    }
    return Boolean(cfg.apiKey && String(cfg.apiKey).trim());
  } catch {
    return false;
  }
}

async function resolveLlmAuth(cfg) {
  if (cfg.provider === 'copilot') {
    const database = require('../core/database.cjs');
    const copilotOAuth = require('../auth/github-copilot-oauth.cjs');
    const { token, baseUrl } = await copilotOAuth.getCopilotToken(database);
    if (!token) throw new Error('GitHub Copilot no conectado. Ve a Ajustes > IA.');
    return { apiKey: token, baseUrl };
  }
  return {
    apiKey: cfg.apiKey,
    baseUrl: cfg.provider === 'ollama' ? cfg.ollamaBase : cfg.openaiBase,
  };
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
function buildOpenAStyleMessages(system, userText, imageDataUrls, provider, modelId) {
  const imgs = (imageDataUrls || []).filter(Boolean);
  const userContent = llmService.buildImageContent(userText, imgs, { provider, modelId });
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
function buildAnthropicStyleMessages(system, userText, imageDataUrls, provider, modelId) {
  return buildOpenAStyleMessages(system, userText, imageDataUrls, provider, modelId);
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
  const cfg = await resolveConfig(getQueries);
  const hasImages = (imageDataUrls || []).length > 0;
  if (hasImages && !isVisionSupportedProviderId(cfg.provider)) {
    throw new Error(
      `Provider "${cfg.provider}" no admite imágenes con la API actual. Usa OpenAI, Anthropic, Google, MiniMax, Dome u Ollama.`
    );
  }
  if (!await isCloudLlmAvailable(getQueries)) {
    throw new Error('Configura un proveedor de IA en Ajustes (clave API, Ollama o sesión Dome).');
  }
  const openOpts = { maxTokens: maxTokens || (json ? 1024 : 4096) };
  if (json) openOpts.responseFormat = 'json_object';

  const googleOpts = {
    maxOutputTokens: openOpts.maxTokens,
    responseMimeType: json ? 'application/json' : undefined,
  };
  const anthOpts = { maxTokens: openOpts.maxTokens };

  const resolvedModel = cfg.provider === 'minimax' ? (cfg.model || 'MiniMax-M3') : cfg.model;

  const messages = hasImages
    ? buildOpenAStyleMessages(system, user, imageDataUrls, cfg.provider, resolvedModel)
    : (() => {
        const m = [];
        if (system && String(system).trim()) m.push({ role: 'system', content: String(system) });
        m.push({ role: 'user', content: String(user) });
        return m;
      })();

  let out = '';
  let err = null;
  try {
    if (cfg.provider === 'anthropic' && json) {
      // Anthropic: inject JSON instruction in system, no response_format param
      if (!cfg.apiKey) throw new Error('Falta la clave API en Ajustes');
      const m2 = hasImages
        ? buildAnthropicStyleMessages(
            `${system || ''}\nResponde solo con un objeto JSON válido, sin markdown.`,
            user,
            imageDataUrls,
            'anthropic',
            cfg.model,
          )
        : (() => {
            const m = [];
            m.push({ role: 'user', content: String(user) });
            if (system) m.unshift({ role: 'system', content: String(system) + '\nResponde solo con JSON.' });
            return m;
          })();
      out = await llmService.chat({
        provider: 'anthropic',
        model: cfg.model,
        apiKey: cfg.apiKey,
        messages: m2,
        options: anthOpts,
      });
    } else {
      if (cfg.provider !== 'ollama' && cfg.provider !== 'dome' && cfg.provider !== 'copilot' && !cfg.apiKey) {
        throw new Error('Falta la clave API en Ajustes');
      }
      const auth = await resolveLlmAuth(cfg);
      const chatResult = await llmService.chat({
        provider: cfg.provider,
        model: cfg.provider === 'minimax' ? (cfg.model || 'MiniMax-M3') : cfg.model,
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        messages,
        options: {
          ...(cfg.provider === 'google' ? googleOpts : openOpts),
          ...(json ? { responseFormat: 'json_object' } : {}),
        },
      });
      out = chatResult;
    }
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e));
    throw err;
  } finally {
    const usage = out && typeof out === 'object' && out.usage ? out.usage : null;
    emitAnalytics(windowManager, {
      task,
      provider: cfg.provider,
      ms: Date.now() - t0,
      ok: !err,
      error: err?.message,
      ...(usage
        ? {
            inputTokens: usage.inputTokens ?? null,
            outputTokens: usage.outputTokens ?? null,
            totalTokens: usage.totalTokens ?? null,
          }
        : {}),
    });
  }

  const text = typeof out === 'object' && out && 'text' in out ? out.text : String(out || '');
  return String(text || '');
}

/**
 * @param {Parameters<typeof generateText>[0] & { onChunk: (c: { type: 'text' | 'json_object', text?: string }) => void, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
async function streamGenerate(opts) {
  const { getQueries, system, user, imageDataUrls = [], onChunk, maxTokens, task = 'stream', windowManager } = opts;
  const t0 = Date.now();
  const cfg = await resolveConfig(getQueries);
  const hasImages = (imageDataUrls || []).length > 0;
  if (hasImages && !isVisionSupportedProviderId(cfg.provider)) {
    throw new Error(`Provider "${cfg.provider}" no admite imágenes.`);
  }
  if (!await isCloudLlmAvailable(getQueries)) {
    throw new Error('Configura un proveedor de IA en Ajustes.');
  }
  const streamOpts = { maxTokens: maxTokens || 1024 };
  const googleOpts = { maxOutputTokens: streamOpts.maxTokens };
  const resolvedModel = cfg.provider === 'minimax' ? (cfg.model || 'MiniMax-M3') : cfg.model;

  const messages = hasImages
    ? buildOpenAStyleMessages(system, user, imageDataUrls, cfg.provider, resolvedModel)
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
  let usage = null;
  try {
    if (cfg.provider !== 'ollama' && cfg.provider !== 'dome' && cfg.provider !== 'copilot' && !cfg.apiKey) {
      throw new Error('Falta la clave API');
    }
    const auth = await resolveLlmAuth(cfg);
    const streamResult = await llmService.stream({
      provider: cfg.provider,
      model: cfg.provider === 'minimax' ? (cfg.model || 'MiniMax-M3') : cfg.model,
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      messages,
      options: cfg.provider === 'google' ? googleOpts : streamOpts,
      onChunk: (data) => {
        if (data?.type === 'usage' && data.usage) {
          usage = data.usage;
          onChunk(data);
          return;
        }
        wrap(data);
      },
    });
    full = streamResult?.text ?? String(streamResult || '');
    usage = streamResult?.usage ?? usage;
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e));
    throw err;
  } finally {
    emitAnalytics(windowManager, {
      task,
      provider: cfg.provider,
      ms: Date.now() - t0,
      ok: !err,
      error: err?.message,
      ...(usage
        ? {
            inputTokens: usage.inputTokens ?? null,
            outputTokens: usage.outputTokens ?? null,
            totalTokens: usage.totalTokens ?? null,
          }
        : {}),
    });
  }
  return full;
}

/**
 * @param {import('./cloud-llm-tasks.cjs')} tasks - lazy ref
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
