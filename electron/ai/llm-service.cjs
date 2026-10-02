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
  if (options.signal) out.signal = options.signal;
  if (options.timeoutMs) out.timeoutMs = options.timeoutMs;
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
async function resolveAuthOptions(ai, { provider, model, apiKey, baseUrl, options }) {
  let contextWindow;
  try {
    const database = require('../core/database.cjs');
    const { readPersistedContextWindow } = require('./context-window.cjs');
    const persisted = readPersistedContextWindow(database.getQueries(), provider);
    if (persisted > 0) contextWindow = persisted;
  } catch {
    /* settings optional for standalone llm calls */
  }
  const database = require('../core/database.cjs');
  const { getModelCollection, ensureChatProvider } = require('./model-collection.cjs');
  const models = await getModelCollection(database);
  const catalogModel = models.getModel(provider, model);
  const resolvedModel = catalogModel ? { ...catalogModel, ...(baseUrl ? { baseUrl } : {}), ...(contextWindow > 0 ? { contextWindow } : {}) } : ai.resolveDomeModel({ provider, model, baseUrl, contextWindow, input: require('./model-input.cjs').resolveModelInput(provider, model, undefined, baseUrl) });
  const streamOpts = buildStreamOptions(options, apiKey);
  ensureChatProvider(models, ai, resolvedModel);
  return { resolvedModel, streamOpts, models };
}

async function chat({ provider, model, apiKey, baseUrl, messages, options = {} }) {
  const ai = await loadAi();
  const { resolvedModel, streamOpts, models } = await resolveAuthOptions(ai, {
    provider,
    model,
    apiKey,
    baseUrl,
    options,
  });
  require('./model-handoff.cjs').validateModelHandoff(resolvedModel, messages);
  const sysMsg = (messages || []).find((m) => m.role === 'system');
  const systemPrompt =
    typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const normalized = require('./message-multimodal.cjs').normalizeMessagesForProvider(messages || [], { provider, modelId: model, input: resolvedModel.input });
  const context = ai.legacyMessagesToContext(systemPrompt, normalized);
  const result = await models.completeSimple(resolvedModel, context, streamOpts);
  if (result.stopReason === 'error' || result.stopReason === 'aborted') throw Object.assign(new Error(result.errorMessage || result.stopReason), { name: result.stopReason === 'aborted' ? 'AbortError' : 'Error' });
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
  const { resolvedModel, streamOpts, models } = await resolveAuthOptions(ai, {
    provider,
    model,
    apiKey,
    baseUrl,
    options,
  });
  require('./model-handoff.cjs').validateModelHandoff(resolvedModel, messages);
  const sysMsg = (messages || []).find((m) => m.role === 'system');
  const systemPrompt =
    typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const normalized = require('./message-multimodal.cjs').normalizeMessagesForProvider(messages || [], { provider, modelId: model, input: resolvedModel.input });
  const context = ai.legacyMessagesToContext(systemPrompt, normalized);
  const eventStream = models.streamSimple(resolvedModel, context, streamOpts);

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
