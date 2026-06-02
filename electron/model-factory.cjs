/* eslint-disable no-console */
'use strict';

/**
 * LangChain chat model factory for Dome (shared by langgraph-agent, llm-service, agent-team).
 */

const database = require('./database.cjs');
const { temperatureOptions } = require('./model-params.cjs');

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

/**
 * Custom fetch for Dome's OpenAI-compatible endpoint.
 * Keeps stream_options for usage; still strips parallel_tool_calls if the API rejects it.
 */
async function domeFetch(url, init) {
  if (init?.body) {
    try {
      const body = JSON.parse(init.body);
      delete body.parallel_tool_calls;
      if (Array.isArray(body.tools)) {
        body.tools = body.tools.map((t) => {
          if (!t?.function?.parameters) return t;
          return {
            ...t,
            function: { ...t.function, parameters: stripZodJsonSchemaMeta(t.function.parameters) },
          };
        });
      }
      if (Array.isArray(body.messages)) {
        body.messages = body.messages.map((msg) => {
          if (!Array.isArray(msg.content)) return msg;
          const text = msg.content
            .map((block) => (typeof block === 'string' ? block : block?.text ?? ''))
            .join('');
          return { ...msg, content: text };
        });
      }
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      /* leave body as-is */
    }
  }
  return fetch(url, init);
}

async function miniMaxFetch(url, init) {
  if (init?.body) {
    try {
      const body = JSON.parse(init.body);
      if (Array.isArray(body.tools)) {
        body.tools = body.tools.map((t) => {
          if (!t?.function?.parameters) return t;
          return {
            ...t,
            function: { ...t.function, parameters: stripZodJsonSchemaMeta(t.function.parameters) },
          };
        });
      }
      delete body.stream_options;
      delete body.parallel_tool_calls;
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      /* leave */
    }
  }
  return fetch(url, init);
}

async function createModelFromConfig(provider, model, apiKey, baseUrl) {
  if (provider === 'ollama') {
    const { ChatOllama } = await import('@langchain/ollama');
    const queries = database?.getQueries?.();
    const temp = queries?.getSetting?.get?.('ollama_temperature')?.value;
    const topP = queries?.getSetting?.get?.('ollama_top_p')?.value;
    const numPredict = queries?.getSetting?.get?.('ollama_num_predict')?.value;
    const showThinking = queries?.getSetting?.get?.('ollama_show_thinking')?.value;
    const useThink = showThinking === 'true' || showThinking === '1';
    return new ChatOllama({
      model: model || 'llama3.2',
      baseUrl: baseUrl || 'http://127.0.0.1:11434',
      temperature: temp ? parseFloat(temp) : 0.7,
      topP: topP ? parseFloat(topP) : 0.9,
      numPredict: numPredict ? parseInt(numPredict, 10) : 4000,
      think: useThink,
      ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    });
  }
  if (provider === 'openai') {
    const { ChatOpenAI } = await import('@langchain/openai');
    return new ChatOpenAI({
      model: model || 'gpt-4o',
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      streamUsage: true,
      ...temperatureOptions(model),
    });
  }
  if (provider === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      model: model || 'claude-sonnet-4-20250514',
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      ...temperatureOptions(model),
    });
  }
  if (provider === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({
      model: model || 'gemini-3-flash-preview',
      apiKey: apiKey || process.env.GOOGLE_API_KEY,
      ...temperatureOptions(model),
    });
  }
  if (provider === 'minimax') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    const { MINIMAX_BASE_URL } = require('./minimax-config.cjs');
    const resolvedModel = model || 'MiniMax-M3';
    const isM3 = /^MiniMax-M3$/i.test(resolvedModel);
    return new ChatAnthropic({
      model: resolvedModel,
      anthropicApiKey: apiKey,
      anthropicApiUrl: `${MINIMAX_BASE_URL}/anthropic`,
      clientOptions: { fetch: miniMaxFetch },
      ...temperatureOptions(resolvedModel),
      maxTokens: isM3 ? 16384 : 8192,
    });
  }
  if (provider === 'dome') {
    const { ChatOpenAI } = await import('@langchain/openai');
    return new ChatOpenAI({
      model: model || 'dome/auto',
      apiKey: apiKey,
      streamUsage: true,
      configuration: { baseURL: baseUrl, fetch: domeFetch },
      ...temperatureOptions(model),
    });
  }
  if (provider === 'openrouter') {
    const { ChatOpenRouter } = await import('@langchain/openrouter');
    const { OPENROUTER_SITE_URL, OPENROUTER_SITE_NAME } = require('./openrouter-config.cjs');
    return new ChatOpenRouter({
      model: model || 'anthropic/claude-sonnet-4.5',
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      siteUrl: OPENROUTER_SITE_URL,
      siteName: OPENROUTER_SITE_NAME,
      ...temperatureOptions(model),
    });
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = {
  stripZodJsonSchemaMeta,
  domeFetch,
  miniMaxFetch,
  createModelFromConfig,
};
