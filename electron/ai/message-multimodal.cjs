'use strict';

const { extractMarkdownImages } = require('../../shared/message-visual/parse-markdown-images.cjs');

/** @typedef {'text'|'image'|'video'} ModelInputType */

const OPENAI_STYLE_PROVIDERS = new Set([
  'openai',
  'google',
  'openrouter',
  'ollama',
  'dome',
  'vllm',
  'lmstudio',
]);
const ANTHROPIC_STYLE_PROVIDERS = new Set(['anthropic', 'minimax']);

/** Model capabilities are owned by the resolved provider catalog, not its name. */
function resolveModelCapabilities(provider, modelId, declaredInput) {
  let input = declaredInput;
  if (!Array.isArray(input)) {
    input = require('./model-input.cjs').resolveModelInput(provider, modelId);
  }
  input = Array.isArray(input) ? input : ['text'];
  return { supportsImage: input.includes('image'), supportsVideo: input.includes('video'), input };
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
  if ((p === 'opencode' || p === 'opencode-go') && require('@dome/ai').resolveDomeModel({ provider: p, model: id }).api === 'anthropic-messages') {
    return 'anthropic';
  }
  return 'openai';
}

/**
 * @param {{ dataUrl: string, mime?: string, name?: string }} image
 * @param {'openai'|'anthropic'} style
 */
function imageBlock(image) {
  const parsed = parseDataUrl(image.dataUrl);
  if (!parsed) throw new Error('Image input requires base64 encoded image data');
  return { type: 'image', data: parsed.data, mimeType: parsed.mediaType };
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
      'El modelo seleccionado no admite imágenes. Elige un modelo con visión.',
    );
  }
  if (videoCount > 0 && !capabilities.supportsVideo) {
    throw new Error(
      'El modelo seleccionado no admite video. Elige un modelo que declare soporte de video.',
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
  const capabilities = resolveModelCapabilities(provider, modelId, opts.input);

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
    validateMultimodalRequest(capabilities, { images: content.filter((b) => b?.type === 'image' || b?.type === 'image_url'), videos: content.filter((b) => b?.type === 'video') });
    return content.map((b) => {
      if (b?.type === 'image_url') return imageBlock({ dataUrl: b.image_url?.url });
      if (b?.type === 'image' && b.source?.type === 'base64') return { type: 'image', data: b.source.data, mimeType: b.source.media_type };
      return b;
    });
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
  const capabilities = resolveModelCapabilities(provider, modelId, opts.input);
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
      input: opts.input,
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
