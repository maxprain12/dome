'use strict';

const { extractMarkdownImages } = require('../../shared/message-visual/parse-markdown-images.cjs');

/** @typedef {'text'|'image'|'video'} ModelInputType */

const OPENAI_STYLE_PROVIDERS = new Set(['openai', 'google', 'openrouter', 'ollama', 'dome']);
const ANTHROPIC_STYLE_PROVIDERS = new Set(['anthropic', 'minimax']);

const MINIMAX_M3_RE = /^minimax-m3$/i;

/** Static capability hints when catalog lookup is unavailable in main process. */
const STATIC_MODEL_INPUT = {
  'minimax-m3': ['text', 'image', 'video'],
  'gpt-5.2': ['text', 'image'],
  'gpt-5': ['text', 'image'],
  'gpt-5-mini': ['text', 'image'],
  'gpt-5-nano': ['text', 'image'],
  'gpt-4o': ['text', 'image'],
  'gpt-4o-mini': ['text', 'image'],
  'gpt-4.1': ['text', 'image'],
  'gpt-4.1-mini': ['text', 'image'],
  'gpt-4.1-nano': ['text', 'image'],
  'claude-opus-4-6': ['text', 'image'],
  'claude-sonnet-4-5': ['text', 'image'],
  'claude-haiku-4-5': ['text', 'image'],
  'gemini-3-flash': ['text', 'image'],
  'gemini-3-flash-preview': ['text', 'image'],
  'gemini-3-pro-preview': ['text', 'image'],
  'gemini-2.5-flash': ['text', 'image'],
  'gemini-2.5-flash-lite': ['text', 'image'],
  'kimi-k2.5': ['text', 'image'],
  'kimi-k2.6': ['text', 'image'],
  'kimi-k2.7-code': ['text'],
  'minimax-m3': ['text', 'image'],
  'qwen3.6-plus': ['text', 'image'],
  'qwen3.7-plus': ['text', 'image'],
  'mimo-v2.5': ['text', 'image'],
};

/** Models on OpenCode that use anthropic-messages API (content block style). */
const OPENCODE_ANTHROPIC_MODEL_IDS = new Set([
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'minimax-m2.5',
  'minimax-m2.7',
  'minimax-m3',
  'qwen3.7-max',
  'qwen3.7-plus',
]);

/**
 * @param {string} provider
 * @param {string} [modelId]
 * @returns {{ supportsImage: boolean, supportsVideo: boolean, input: ModelInputType[] }}
 */
function resolveModelCapabilities(provider, modelId) {
  const p = String(provider || '').toLowerCase();
  const id = String(modelId || '').trim();
  const lower = id.toLowerCase();

  if (p === 'minimax') {
    if (MINIMAX_M3_RE.test(id)) {
      return { supportsImage: true, supportsVideo: true, input: ['text', 'image', 'video'] };
    }
    return { supportsImage: false, supportsVideo: false, input: ['text'] };
  }

  const staticInput = STATIC_MODEL_INPUT[lower];
  if (staticInput) {
    return {
      supportsImage: staticInput.includes('image'),
      supportsVideo: staticInput.includes('video'),
      input: staticInput,
    };
  }

  if (p === 'anthropic' || (p === 'openrouter' && /claude|anthropic/i.test(id))) {
    return { supportsImage: true, supportsVideo: false, input: ['text', 'image'] };
  }
  if (p === 'google' || (p === 'openrouter' && /gemini/i.test(id))) {
    return { supportsImage: true, supportsVideo: false, input: ['text', 'image'] };
  }
  if (p === 'openai' || (p === 'openrouter' && /gpt|openai/i.test(id))) {
    const vision = /gpt-4|gpt-5|gpt-4o|o1|o3|o4|vision|vl/i.test(id);
    return { supportsImage: vision, supportsVideo: false, input: vision ? ['text', 'image'] : ['text'] };
  }
  if (p === 'ollama') {
    const vision = /llava|minicpm-v|glm4v|vision|vl|moondream|bakllava/i.test(id);
    return { supportsImage: vision, supportsVideo: false, input: vision ? ['text', 'image'] : ['text'] };
  }

  if (p === 'opencode' || p === 'opencode-go') {
    const staticInput = STATIC_MODEL_INPUT[lower];
    if (staticInput) {
      return {
        supportsImage: staticInput.includes('image'),
        supportsVideo: staticInput.includes('video'),
        input: staticInput,
      };
    }
    if (/claude|gemini|gpt-4|gpt-5|kimi|qwen.*plus|mimo|minimax-m3/i.test(id)) {
      const hasVision = /claude|gemini|gpt-|kimi|qwen|mimo|minimax-m3/i.test(id);
      return { supportsImage: hasVision, supportsVideo: false, input: hasVision ? ['text', 'image'] : ['text'] };
    }
    return { supportsImage: false, supportsVideo: false, input: ['text'] };
  }

  return { supportsImage: OPENAI_STYLE_PROVIDERS.has(p), supportsVideo: false, input: ['text'] };
}

/**
 * @param {string} dataUrl
 * @returns {{ mediaType: string, data: string } | null}
 */
function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

/**
 * @param {string} provider
 * @param {string} [modelId]
 * @returns {'openai'|'anthropic'}
 */
function contentStyleForProvider(provider, modelId) {
  const p = String(provider || '').toLowerCase();
  const id = String(modelId || '').trim().toLowerCase();
  if (ANTHROPIC_STYLE_PROVIDERS.has(p)) return 'anthropic';
  if ((p === 'opencode' || p === 'opencode-go') && (OPENCODE_ANTHROPIC_MODEL_IDS.has(id) || /^claude-/i.test(id))) {
    return 'anthropic';
  }
  return 'openai';
}

/**
 * @param {{ dataUrl: string, mime?: string, name?: string }} image
 * @param {'openai'|'anthropic'} style
 */
function imageBlock(image, style) {
  const url = String(image.dataUrl || '').trim();
  if (!url) return null;
  if (style === 'anthropic') {
    const parsed = parseDataUrl(url);
    if (parsed) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
      };
    }
    if (/^https?:\/\//i.test(url)) {
      return { type: 'image', source: { type: 'url', url } };
    }
  }
  return { type: 'image_url', image_url: { url } };
}

/**
 * @param {{ dataUrl?: string, fileId?: string, mime?: string, name?: string }} video
 */
function videoBlock(video) {
  if (video.fileId) {
    return {
      type: 'video',
      source: { type: 'url', url: `mm_file://${video.fileId}` },
    };
  }
  const url = String(video.dataUrl || '').trim();
  if (!url) return null;
  const parsed = parseDataUrl(url);
  if (parsed) {
    return {
      type: 'video',
      source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
    };
  }
  if (/^https?:\/\//i.test(url)) {
    return { type: 'video', source: { type: 'url', url } };
  }
  return null;
}

/**
 * @param {{
 *   text?: string,
 *   images?: Array<{ dataUrl: string, mime?: string, name?: string }>,
 *   videos?: Array<{ dataUrl?: string, fileId?: string, mime?: string, name?: string }>,
 *   provider?: string,
 *   modelId?: string,
 * }} opts
 * @returns {unknown[]}
 */
function buildNativeContentBlocks(opts) {
  const provider = String(opts.provider || 'openai').toLowerCase();
  const modelId = String(opts.modelId || '');
  const style = contentStyleForProvider(provider, modelId);
  const blocks = [];
  for (const img of opts.images || []) {
    const block = imageBlock(img, style);
    if (block) blocks.push(block);
  }
  for (const vid of opts.videos || []) {
    const block = videoBlock(vid);
    if (block) blocks.push(block);
  }
  const text = String(opts.text || '').trim();
  if (text) blocks.push({ type: 'text', text });
  return blocks;
}

/**
 * @param {{ supportsImage: boolean, supportsVideo: boolean }} capabilities
 * @param {{ images?: unknown[], videos?: unknown[] }} payload
 */
function validateMultimodalRequest(capabilities, payload) {
  const imageCount = (payload.images || []).length;
  const videoCount = (payload.videos || []).length;
  if (imageCount > 0 && !capabilities.supportsImage) {
    throw new Error(
      'El modelo seleccionado no admite imágenes. Usa MiniMax-M3 u otro modelo con visión.',
    );
  }
  if (videoCount > 0 && !capabilities.supportsVideo) {
    throw new Error(
      'El modelo seleccionado no admite video. Solo MiniMax-M3 soporta video en chat.',
    );
  }
}

/**
 * @param {string | unknown[]} content
 * @param {{
 *   provider?: string,
 *   modelId?: string,
 *   attachments?: { images?: unknown[], videos?: unknown[] },
 * }} opts
 * @returns {string | unknown[]}
 */
function normalizeUserMessage(content, opts = {}) {
  const provider = String(opts.provider || 'openai').toLowerCase();
  const modelId = String(opts.modelId || '');
  const capabilities = resolveModelCapabilities(provider, modelId);

  let text = '';
  let images = [];
  let videos = [];

  if (opts.attachments && (opts.attachments.images?.length || opts.attachments.videos?.length)) {
    images = [...(opts.attachments.images || [])];
    videos = [...(opts.attachments.videos || [])];
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content
        .filter((b) => b && typeof b === 'object' && b.type === 'text')
        .map((b) => b.text || '')
        .join('\n');
    }
  } else if (typeof content === 'string') {
    const extracted = extractMarkdownImages(content);
    text = extracted.text;
    images = extracted.images.map((img) => ({ dataUrl: img.dataUrl }));
  } else if (Array.isArray(content)) {
    return content;
  } else {
    text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  }

  validateMultimodalRequest(capabilities, { images, videos });

  if (images.length === 0 && videos.length === 0) {
    return text;
  }

  return buildNativeContentBlocks({ text, images, videos, provider, modelId });
}

/**
 * Build multimodal user message content array (images + text) — OpenAI-style blocks.
 * @param {string} userText
 * @param {string[]} imageDataUrls
 * @param {{ provider?: string, modelId?: string }} [opts]
 */
function buildImageContent(userText, imageDataUrls, opts = {}) {
  const images = (imageDataUrls || []).filter(Boolean).map((dataUrl) => ({ dataUrl }));
  const provider = opts.provider || 'openai';
  const modelId = opts.modelId || '';
  const capabilities = resolveModelCapabilities(provider, modelId);
  validateMultimodalRequest(capabilities, { images, videos: [] });
  return buildNativeContentBlocks({
    text: userText || '',
    images,
    provider,
    modelId,
  });
}

/**
 * @param {Array<{ role: string, content?: string | unknown[], attachments?: { images?: unknown[], videos?: unknown[] } }>} messages
 * @param {{ provider?: string, modelId?: string }} opts
 */
function normalizeMessagesForProvider(messages, opts = {}) {
  const provider = opts.provider || 'openai';
  const modelId = opts.modelId || '';
  return (messages || []).map((m) => {
    if (m.role !== 'user') return m;
    const normalized = normalizeUserMessage(m.content, {
      provider,
      modelId,
      attachments: m.attachments,
    });
    return { ...m, content: normalized };
  });
}

module.exports = {
  resolveModelCapabilities,
  buildNativeContentBlocks,
  buildImageContent,
  normalizeUserMessage,
  normalizeMessagesForProvider,
  validateMultimodalRequest,
  parseDataUrl,
  contentStyleForProvider,
};
