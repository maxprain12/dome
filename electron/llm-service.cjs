/* eslint-disable no-console */
/**
 * Unified LLM service — thin wrapper around LangChain chat models.
 * Replaces the custom HTTP/SSE client in ai-cloud-service.cjs.
 */
'use strict';

const { createModelFromConfig } = require('./model-factory.cjs');
const { buildImageContent: buildMultimodalImageContent } = require('./message-multimodal.cjs');

function pickTokenNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (let i = 0; i < keys.length; i += 1) {
    const v = obj[keys[i]];
    if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.floor(Number(v)));
  }
  return null;
}

function extractUsageFromMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const um = msg.usage_metadata || msg.lc_kwargs?.usage_metadata;
  const rm = msg.response_metadata;
  const tokenUsage = rm?.tokenUsage || rm?.token_usage;
  const input =
    pickTokenNumber(um, ['input_tokens', 'prompt_tokens', 'inputTokens']) ??
    pickTokenNumber(tokenUsage, ['promptTokens', 'prompt_tokens', 'input_tokens']);
  const output =
    pickTokenNumber(um, ['output_tokens', 'completion_tokens', 'outputTokens']) ??
    pickTokenNumber(tokenUsage, ['completionTokens', 'completion_tokens', 'output_tokens']);
  let total =
    pickTokenNumber(um, ['total_tokens', 'totalTokens']) ??
    pickTokenNumber(tokenUsage, ['totalTokens', 'total_tokens']);
  if (total == null && input != null && output != null) total = input + output;
  if (input == null && output == null && total == null) return null;
  const i = input ?? 0;
  const o = output ?? 0;
  return { inputTokens: i, outputTokens: o, totalTokens: total ?? i + o };
}

/**
 * Build LangChain message objects from plain {role, content} pairs.
 * Handles multimodal content arrays (image_url blocks) for vision tasks.
 */
async function toMessages(rawMessages) {
  const { HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');
  const result = [];
  for (const m of rawMessages) {
    if (m.role === 'system') {
      result.push(new SystemMessage(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
    } else if (m.role === 'assistant') {
      result.push(new AIMessage(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
    } else {
      // user — may carry multimodal content array
      result.push(new HumanMessage({ content: m.content }));
    }
  }
  return result;
}

/**
 * Build a multimodal user message content array (images + text).
 * @param {string} userText
 * @param {string[]} imageDataUrls
 * @param {{ provider?: string, modelId?: string }} [opts]
 */
function buildImageContent(userText, imageDataUrls, opts = {}) {
  return buildMultimodalImageContent(userText, imageDataUrls, opts);
}

/**
 * Non-streaming completion.
 * @param {{
 *   provider: string,
 *   model?: string,
 *   apiKey?: string,
 *   baseUrl?: string,
 *   messages: Array<{ role: string, content: string | unknown[] }>,
 *   options?: { maxTokens?: number, responseFormat?: string, maxOutputTokens?: number, responseMimeType?: string }
 * }} opts
 * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number, totalTokens: number } | null }>}
 */
async function chat({ provider, model, apiKey, baseUrl, messages, options = {} }) {
  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  const configuredLlm = applyOptions(llm, options);
  const langMessages = await toMessages(messages);
  const response = await configuredLlm.invoke(langMessages);
  return { text: extractText(response), usage: extractUsageFromMessage(response) };
}

/**
 * Streaming completion. Calls onChunk({ type: 'text', text: string }) for each delta.
 * @param {{
 *   provider: string,
 *   model?: string,
 *   apiKey?: string,
 *   baseUrl?: string,
 *   messages: Array<{ role: string, content: string | unknown[] }>,
 *   options?: { maxTokens?: number },
 *   onChunk: (chunk: { type: 'text', text: string }) => void
 * }} opts
 * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number, totalTokens: number } | null }>}
 */
async function stream({ provider, model, apiKey, baseUrl, messages, options = {}, onChunk }) {
  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  const configuredLlm = applyOptions(llm, options);
  const langMessages = await toMessages(messages);
  let full = '';
  let usage = null;
  const streamResponse = await configuredLlm.stream(langMessages);
  for await (const chunk of streamResponse) {
    const u = extractUsageFromMessage(chunk);
    if (u) usage = u;
    const text = extractText(chunk);
    if (text) {
      full += text;
      onChunk({ type: 'text', text });
    }
  }
  return { text: full, usage };
}

/**
 * Apply generation options to a model via .bind() where supported.
 */
function applyOptions(llm, options) {
  const bindOpts = {};
  if (options.maxTokens) bindOpts.max_tokens = options.maxTokens;
  if (options.maxOutputTokens) bindOpts.max_tokens = options.maxOutputTokens;
  if (options.responseMimeType) bindOpts.response_mime_type = options.responseMimeType;
  if (options.responseFormat === 'json_object') {
    bindOpts.response_format = { type: 'json_object' };
  }
  return Object.keys(bindOpts).length > 0 ? llm.bind(bindOpts) : llm;
}

/**
 * Extract text string from a LangChain message/chunk.
 */
function extractText(msg) {
  if (typeof msg?.content === 'string') return msg.content;
  if (Array.isArray(msg?.content)) {
    return msg.content
      .filter((b) => b?.type === 'text')
      .map((b) => b.text || '')
      .join('');
  }
  return '';
}

module.exports = { chat, stream, buildImageContent };
