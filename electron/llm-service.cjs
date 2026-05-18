/* eslint-disable no-console */
/**
 * Unified LLM service — thin wrapper around LangChain chat models.
 * Replaces the custom HTTP/SSE client in ai-cloud-service.cjs.
 */
'use strict';

const { createModelFromConfig } = require('./langgraph-agent.cjs');

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
 */
function buildImageContent(userText, imageDataUrls) {
  const content = [];
  for (const url of imageDataUrls || []) {
    if (url) content.push({ type: 'image_url', image_url: { url } });
  }
  content.push({ type: 'text', text: userText || '' });
  return content;
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
 * @returns {Promise<string>}
 */
async function chat({ provider, model, apiKey, baseUrl, messages, options = {} }) {
  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  // Apply options via withConfig if supported
  const configuredLlm = applyOptions(llm, options);
  const langMessages = await toMessages(messages);
  const response = await configuredLlm.invoke(langMessages);
  return extractText(response);
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
 * @returns {Promise<string>} full accumulated text
 */
async function stream({ provider, model, apiKey, baseUrl, messages, options = {}, onChunk }) {
  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  const configuredLlm = applyOptions(llm, options);
  const langMessages = await toMessages(messages);
  let full = '';
  const streamResponse = await configuredLlm.stream(langMessages);
  for await (const chunk of streamResponse) {
    const text = extractText(chunk);
    if (text) {
      full += text;
      onChunk({ type: 'text', text });
    }
  }
  return full;
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
