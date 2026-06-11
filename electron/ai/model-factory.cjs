/* eslint-disable no-console */
'use strict';

/**
 * LangChain chat model factory for Dome agents.
 * All provider HTTP is delegated to `@dome/ai` via dome-langchain-model.cjs.
 */

const database = require('../core/database.cjs');
const { temperatureOptions } = require('./model-params.cjs');
const { createDomeLangChainModel } = require('./dome-langchain-model.cjs');

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-3-flash-preview',
  minimax: 'MiniMax-M3',
  dome: 'dome/auto',
  openrouter: 'anthropic/claude-sonnet-4.5',
  ollama: 'llama3.2',
  copilot: 'gpt-4.1',
  deepseek: 'deepseek-chat',
  moonshot: 'kimi-k2-0905-preview',
  qwen: 'qwen-max',
  opencode: 'claude-sonnet-4-5',
  'opencode-go': 'deepseek-v4-flash',
};

const DEFAULT_BASE_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ollama: 'http://127.0.0.1:11434',
  opencode: 'https://opencode.ai/zen/v1',
  'opencode-go': 'https://opencode.ai/zen/go/v1',
};

function stripZodJsonSchemaMeta(obj) {
  if (Array.isArray(obj)) return obj.map(stripZodJsonSchemaMeta);
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$schema' || k === 'additionalProperties') continue;
      cleaned[k] = stripZodJsonSchemaMeta(v);
    }
    return cleaned;
  }
  return obj;
}

function resolveApiKey(provider, apiKey) {
  if (apiKey) return apiKey;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'google') return process.env.GOOGLE_API_KEY;
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY;
  if (provider === 'opencode' || provider === 'opencode-go') return process.env.OPENCODE_API_KEY;
  return apiKey;
}

function readOllamaStreamOptions() {
  const queries = database?.getQueries?.();
  const temp = queries?.getSetting?.get?.('ollama_temperature')?.value;
  const topP = queries?.getSetting?.get?.('ollama_top_p')?.value;
  const numPredict = queries?.getSetting?.get?.('ollama_num_predict')?.value;
  const showThinking = queries?.getSetting?.get?.('ollama_show_thinking')?.value;
  const useThink = showThinking === 'true' || showThinking === '1';
  const out = {};
  if (temp) out.temperature = parseFloat(temp);
  if (topP) out.topP = parseFloat(topP);
  if (numPredict) out.maxTokens = parseInt(numPredict, 10);
  if (useThink) out.reasoning = 'medium';
  return out;
}

async function createModelFromConfig(provider, model, apiKey, baseUrl) {
  const resolvedModel = model || DEFAULT_MODELS[provider] || 'gpt-4o-mini';
  const resolvedBaseUrl = baseUrl || DEFAULT_BASE_URLS[provider];
  const resolvedKey = resolveApiKey(provider, apiKey);

  const streamOptions = { ...temperatureOptions(resolvedModel) };
  if (provider === 'ollama') {
    Object.assign(streamOptions, readOllamaStreamOptions());
  }

  return createDomeLangChainModel({
    provider,
    model: resolvedModel,
    apiKey: resolvedKey,
    baseUrl: resolvedBaseUrl,
    streamOptions,
  });
}

module.exports = {
  stripZodJsonSchemaMeta,
  createModelFromConfig,
  DEFAULT_MODELS,
  DEFAULT_BASE_URLS,
};
