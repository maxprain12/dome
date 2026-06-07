/* eslint-disable no-console */
/**
 * Unified LLM service — delegates to `@dome/ai` SDK connectors.
 */
'use strict';

const { buildImageContent: buildMultimodalImageContent } = require('./message-multimodal.cjs');

/** Lazy ESM import of `@dome/ai`. */
async function loadAi() {
  return import('@dome/ai');
}

function buildStreamOptions(options = {}, apiKey) {
  const out = {};
  if (apiKey) out.apiKey = apiKey;
  if (options.maxTokens) out.maxTokens = options.maxTokens;
  if (options.maxOutputTokens) out.maxTokens = options.maxOutputTokens;
  if (options.temperature != null) out.temperature = options.temperature;
  if (options.responseFormat === 'json_object') {
    out.onPayload = (payload) => {
      if (payload && typeof payload === 'object') {
        return { ...payload, response_format: { type: 'json_object' } };
      }
      return payload;
    };
  }
  return out;
}

function buildImageContent(userText, imageDataUrls, opts = {}) {
  return buildMultimodalImageContent(userText, imageDataUrls, opts);
}

/**
 * Non-streaming completion.
 * @returns {Promise<{ text: string, usage: { inputTokens, outputTokens, totalTokens } | null }>}
 */
async function chat({ provider, model, apiKey, baseUrl, messages, options = {} }) {
  const ai = await loadAi();
  const resolvedModel = ai.resolveDomeModel({ provider, model, baseUrl });
  const sysMsg = (messages || []).find((m) => m.role === 'system');
  const systemPrompt =
    typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const context = ai.legacyMessagesToContext(systemPrompt, messages || []);
  const streamOpts = buildStreamOptions(options, apiKey);
  const result = await ai.completeSimple(resolvedModel, context, streamOpts);
  return {
    text: ai.extractTextFromAssistantMessage(result),
    usage: ai.domeUsageToLegacy(result.usage),
  };
}

/**
 * Streaming completion. Calls onChunk({ type: 'text', text }) for each delta.
 */
async function stream({ provider, model, apiKey, baseUrl, messages, options = {}, onChunk }) {
  const ai = await loadAi();
  const resolvedModel = ai.resolveDomeModel({ provider, model, baseUrl });
  const sysMsg = (messages || []).find((m) => m.role === 'system');
  const systemPrompt =
    typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const context = ai.legacyMessagesToContext(systemPrompt, messages || []);
  const streamOpts = buildStreamOptions(options, apiKey);
  const eventStream = ai.streamSimple(resolvedModel, context, streamOpts);

  let full = '';
  for await (const event of eventStream) {
    if (event.type === 'text_delta' && event.delta) {
      full += event.delta;
      if (typeof onChunk === 'function') onChunk({ type: 'text', text: event.delta });
    }
  }

  const final = await eventStream.result();
  const usage = ai.domeUsageToLegacy(final.usage);
  // Surface real token usage to streaming consumers (cloud-llm analytics, vision/OCR).
  if (usage && typeof onChunk === 'function') {
    onChunk({ type: 'usage', usage, partial: false, cumulative: true });
  }
  return {
    text: ai.extractTextFromAssistantMessage(final),
    usage,
  };
}

module.exports = { chat, stream, buildImageContent };
