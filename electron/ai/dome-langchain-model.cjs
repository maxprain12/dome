'use strict';

/**
 * LangChain BaseChatModel adapter over `@dome/ai` (pi SDK).
 * Lets deepagents/langgraph keep using LangChain message types while all
 * provider HTTP goes through the Dome AI package.
 */

const database = require('../core/database.cjs');

function lcContentToString(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && block.type === 'text') return block.text || '';
        return JSON.stringify(block);
      })
      .join('');
  }
  if (content == null) return '';
  return String(content);
}

/**
 * @param {import('@langchain/core/messages').BaseMessage[]} messages
 */
function lcMessagesToLegacy(messages) {
  let systemPrompt = '';
  /** @type {Array<Record<string, unknown>>} */
  const legacy = [];
  for (const m of messages) {
    const type = typeof m._getType === 'function' ? m._getType() : m.type;
    if (type === 'system') {
      const part = lcContentToString(m.content);
      systemPrompt = systemPrompt ? `${systemPrompt}\n${part}` : part;
      continue;
    }
    if (type === 'human') {
      legacy.push({ role: 'user', content: m.content });
      continue;
    }
    if (type === 'ai') {
      legacy.push({
        role: 'assistant',
        content: lcContentToString(m.content),
        toolCalls: (m.tool_calls || []).map((tc) => ({
          id: tc.id || `call_${tc.name || 'tool'}`,
          name: tc.name,
          arguments:
            typeof tc.args === 'object' && tc.args != null
              ? tc.args
              : (() => {
                  try {
                    return JSON.parse(tc.args || '{}');
                  } catch {
                    return {};
                  }
                })(),
        })),
      });
      continue;
    }
    if (type === 'tool') {
      legacy.push({
        role: 'tool',
        toolCallId: m.tool_call_id,
        name: m.name,
        content: lcContentToString(m.content),
      });
    }
  }
  return { systemPrompt, legacy };
}

/**
 * @param {unknown[]} tools
 * @returns {import('@dome/ai').ToolSchema[]}
 */
function bindToolsToSchemas(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  /** @type {import('@dome/ai').ToolSchema[]} */
  const out = [];
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    if (t.type === 'function' && t.function) {
      out.push({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description || '',
          parameters: t.function.parameters || { type: 'object', properties: {} },
        },
      });
      continue;
    }
    if (typeof t.name === 'string' && t.schema) {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.schema,
        },
      });
      continue;
    }
    if (typeof t.name === 'string') {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: { type: 'object', properties: {} },
        },
      });
    }
  }
  return out;
}

/**
 * @param {import('@dome/ai').AssistantMessage} msg
 * @param {typeof import('@langchain/core/messages').AIMessage} AIMessage
 */
function piMessageToAIMessage(msg, AIMessage, ai) {
  const text = ai.extractTextFromAssistantMessage(msg);
  const toolCalls = msg.content
    .filter((b) => b.type === 'toolCall')
    .map((b) => ({
      id: b.id,
      name: b.name,
      args: b.arguments ?? {},
      type: 'tool_call',
    }));
  return new AIMessage({
    content: text,
    tool_calls: toolCalls.length ? toolCalls : undefined,
    usage_metadata: msg.usage
      ? {
          input_tokens: msg.usage.input,
          output_tokens: msg.usage.output,
          total_tokens: msg.usage.totalTokens,
        }
      : undefined,
  });
}

/**
 * @param {{ provider: string, model: string, apiKey?: string, baseUrl?: string, streamOptions?: Record<string, unknown> }} cfg
 */
async function createDomeLangChainModel(cfg) {
  const { BaseChatModel } = await import('@langchain/core/language_models/chat_models');
  const { AIMessage, AIMessageChunk } = await import('@langchain/core/messages');
  const { convertToOpenAITool } = await import('@langchain/core/utils/function_calling');
  const ai = await import('@dome/ai');

  const piModel = ai.resolveDomeModel({
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });

  let copilotHeaders = null;
  if (cfg.provider === 'copilot') {
    const { getCopilotToken, COPILOT_HEADERS } = require('../auth/github-copilot-oauth.cjs');
    const { token, baseUrl } = await getCopilotToken(database);
    cfg.apiKey = token;
    cfg.baseUrl = baseUrl;
    copilotHeaders = COPILOT_HEADERS;
  }

  class DomeAiChatModel extends BaseChatModel {
    constructor(fields) {
      super(fields);
      this.provider = fields.provider;
      this.modelId = fields.model;
      this.apiKey = fields.apiKey;
      this.baseUrl = fields.baseUrl;
      this.extraHeaders = fields.extraHeaders || null;
      this.streamOptions = fields.streamOptions || {};
    }

    _llmType() {
      return 'dome-ai';
    }

    bindTools(tools, kwargs) {
      const normalized = (tools || []).map((t) => {
        try {
          return convertToOpenAITool(t);
        } catch {
          return t;
        }
      });
      return this.bind({ tools: normalized, ...kwargs });
    }

    _buildStreamOptions(options) {
      const out = { apiKey: this.apiKey, ...this.streamOptions };
      if (this.extraHeaders) out.headers = this.extraHeaders;
      if (options?.signal) out.signal = options.signal;
      const tools = bindToolsToSchemas(options?.tools);
      return { out, tools };
    }

    async _generate(messages, options, runManager) {
      const { systemPrompt, legacy } = lcMessagesToLegacy(messages);
      const { out, tools } = this._buildStreamOptions(options);
      const context = ai.legacyMessagesToContext(systemPrompt, legacy, tools);
      const result = await ai.completeSimple(piModel, context, out);
      const message = piMessageToAIMessage(result, AIMessage, ai);
      if (runManager) {
        await runManager.handleLLMNewToken(message.content);
      }
      return {
        generations: [{ text: typeof message.content === 'string' ? message.content : '', message }],
        llmOutput: result.usage ? { tokenUsage: result.usage } : undefined,
      };
    }

    async *_streamResponseChunks(messages, options, runManager) {
      const { systemPrompt, legacy } = lcMessagesToLegacy(messages);
      const { out, tools } = this._buildStreamOptions(options);
      const context = ai.legacyMessagesToContext(systemPrompt, legacy, tools);
      const eventStream = ai.streamSimple(piModel, context, out);

      /** @type {Map<number, { id?: string, name?: string, args: string }>} */
      const toolChunks = new Map();

      for await (const event of eventStream) {
        if (event.type === 'text_delta' && event.delta) {
          const chunk = new AIMessageChunk({ content: event.delta });
          yield chunk;
          if (runManager) await runManager.handleLLMNewToken(event.delta);
          continue;
        }
        if (event.type === 'thinking_delta' && event.delta) {
          const chunk = new AIMessageChunk({
            content: event.delta,
            additional_kwargs: { reasoning_content: event.delta },
          });
          yield chunk;
          continue;
        }
        if (event.type === 'toolcall_start') {
          toolChunks.set(event.contentIndex, { args: '' });
          continue;
        }
        if (event.type === 'toolcall_delta') {
          const cur = toolChunks.get(event.contentIndex) || { args: '' };
          cur.args += event.delta || '';
          toolChunks.set(event.contentIndex, cur);
          const chunk = new AIMessageChunk({
            tool_call_chunks: [
              {
                index: event.contentIndex,
                args: event.delta || '',
              },
            ],
          });
          yield chunk;
          continue;
        }
        if (event.type === 'toolcall_end' && event.toolCall) {
          const chunk = new AIMessageChunk({
            tool_call_chunks: [
              {
                index: event.contentIndex,
                id: event.toolCall.id,
                name: event.toolCall.name,
                args: JSON.stringify(event.toolCall.arguments ?? {}),
              },
            ],
          });
          yield chunk;
        }
      }

      await eventStream.result();
    }
  }

  return new DomeAiChatModel({
    provider: cfg.provider,
    model: cfg.model,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    extraHeaders: copilotHeaders,
    streamOptions: cfg.streamOptions || {},
  });
}

module.exports = { createDomeLangChainModel };
