/* eslint-disable no-console */
/**
 * LangGraph Agent - Main Process
 *
 * Runs the chat with tools using LangGraph/createAgent.
 * Converts Dome's OpenAI-format tool definitions to LangChain tools,
 * creates a model from provider config, and streams results.
 * Uses SqliteSaver for persistent checkpoints (survives app restart).
 */

const path = require('path');
const { app } = require('electron');
const aiChatWithTools = require('./ai-chat-with-tools.cjs');
const { executeToolInMain, getWhatsAppToolDefinitions } = aiChatWithTools;
const { getMCPTools } = require('./mcp-client.cjs');
const database = require('./database.cjs');

let _checkpointer = null;

async function getCheckpointer() {
  if (_checkpointer) return _checkpointer;
  const { SqliteSaver } = await import('@langchain/langgraph-checkpoint-sqlite');
  const dbPath = path.join(app.getPath('userData'), 'langgraph-checkpoints.db');
  _checkpointer = SqliteSaver.fromConnString(dbPath);
  return _checkpointer;
}

function normalizeToolName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Create LangChain tools from OpenAI-format definitions.
 * Uses dynamic import for ESM @langchain/core (tool, tool schema).
 */
async function createLangChainToolsFromOpenAIDefinitions(defs, executeFn) {
  const { tool } = await import('@langchain/core/tools');
  const zodMod = await import('zod');
  const z = zodMod.z ?? zodMod.default ?? zodMod;

  const tools = [];
  for (const def of defs) {
    if (def.type !== 'function' || !def.function) continue;
    const { name, description, parameters } = def.function;
    const normName = normalizeToolName(name);
    const params = parameters || {};
    const zodShape = {};

    if (params.type === 'object' && params.properties) {
      const required = new Set(params.required || []);
      for (const [key, prop] of Object.entries(params.properties)) {
        if (!prop || typeof prop !== 'object') continue;
        let field;
        if (prop.type === 'string') field = z.string();
        else if (prop.type === 'number') field = z.number();
        else if (prop.type === 'integer') field = z.number().int();
        else if (prop.type === 'boolean') field = z.boolean();
        else if (prop.type === 'array') field = z.array(z.unknown());
        else if (prop.enum && Array.isArray(prop.enum)) {
          const valid = prop.enum.filter((v) => typeof v === 'string');
          if (valid.length > 0) field = z.enum(valid);
          else field = z.string();
        } else field = z.unknown();
        if (prop.description) field = field.describe(prop.description);
        zodShape[key] = required.has(key) ? field : field.optional();
      }
    }

    const schema = Object.keys(zodShape).length > 0 ? z.object(zodShape) : z.object({});
    const lcTool = tool(
      async (input) => {
        const result = await executeFn(normName, input || {});
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      { name: normName, description: description || '', schema },
    );
    tools.push(lcTool);
  }
  return tools;
}

/**
 * Create chat model from provider config.
 * For Ollama: uses recommended defaults (temperature 0.7, topP 0.9, numPredict 4000).
 * think: false by default — avoids 500 errors with glm-5:cloud and other models.
 * Set ollama_show_thinking=true in settings to enable reasoning/think mode.
 */
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
    });
  }
  if (provider === 'openai') {
    const { ChatOpenAI } = await import('@langchain/openai');
    return new ChatOpenAI({
      model: model || 'gpt-4o',
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });
  }
  if (provider === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      model: model || 'claude-sonnet-4-20250514',
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
    });
  }
  if (provider === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({
      model: model || 'gemini-1.5-flash',
      apiKey: apiKey || process.env.GOOGLE_API_KEY,
      temperature: 0.7,
    });
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Convert Dome messages to LangChain format.
 * Uses dynamic import for ESM.
 */
async function toLangChainMessages(messages) {
  const { HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');
  const result = [];
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (m.role === 'system') result.push(new SystemMessage(content));
    else if (m.role === 'user') result.push(new HumanMessage(content));
    else if (m.role === 'assistant') result.push(new AIMessage(content));
    else result.push(new HumanMessage(content));
  }
  return result;
}

/**
 * Trim messages for Ollama (smaller context window). Uses trimMessages from @langchain/core.
 * Keeps system message and last N tokens of conversation.
 * @param {import('@langchain/core/messages').BaseMessage[]} messages
 * @param {import('@langchain/core').BaseChatModel} llm - model for token counting
 * @returns {Promise<import('@langchain/core/messages').BaseMessage[]>}
 */
async function trimMessagesForOllama(messages, llm) {
  const { trimMessages } = await import('@langchain/core/messages');
  const OLLAMA_MAX_TOKENS = 8192;
  try {
    const trimmed = await trimMessages(messages, {
      maxTokens: OLLAMA_MAX_TOKENS,
      tokenCounter: llm,
      strategy: 'last',
      includeSystem: true,
      startOn: 'human',
      endOn: ['human', 'tool'],
    });
    if (messages.length !== trimmed.length) {
      console.log(`[AI LangGraph] Ollama: trimmed ${messages.length} -> ${trimmed.length} messages`);
    }
    return trimmed;
  } catch (e) {
    console.warn('[AI LangGraph] Ollama trim failed, using full history:', e?.message);
    return messages;
  }
}

/**
 * Invoke LangGraph agent with streaming.
 * @param {Object} opts - { provider, model, apiKey, baseUrl, messages, toolDefinitions, onChunk, signal, threadId }
 * @returns {Promise<string>} Final response text
 */
async function invokeLangGraphAgent(opts) {
  const {
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    toolDefinitions,
    onChunk,
    signal,
    threadId,
  } = opts;

  const { createAgent } = await import('langchain');

  const executeFn = (name, args) => executeToolInMain(name, args);

  const domeTools = await createLangChainToolsFromOpenAIDefinitions(
    toolDefinitions || getWhatsAppToolDefinitions(),
    executeFn,
  );
  const mcpTools = await getMCPTools(database);
  const tools = [...domeTools, ...mcpTools];

  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);

  const checkpointer = await getCheckpointer();

  const agent = createAgent({
    model: llm,
    tools,
    checkpointer,
  });

  let lcMessages = await toLangChainMessages(messages);
  if (provider === 'ollama' && lcMessages.length > 0) {
    lcMessages = await trimMessagesForOllama(lcMessages, llm);
  }
  const thread_id = threadId || 'default';
  let fullText = '';

  try {
    const stream = await agent.stream(
      { messages: lcMessages },
      {
        streamMode: 'messages',
        signal,
        configurable: { thread_id },
      },
    );

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      if (Array.isArray(chunk)) {
        for (const msg of chunk) {
          // ToolMessage: tool result from completed tool execution
          const msgType = msg?._getType?.() ?? msg?.constructor?.name;
          if ((msgType === 'tool' || msgType === 'ToolMessage') && msg.tool_call_id != null) {
            let resultContent = msg.content;
            if (typeof resultContent !== 'string') {
              try {
                resultContent = JSON.stringify(resultContent);
              } catch {
                resultContent = String(resultContent);
              }
            }
            if (onChunk) {
              onChunk({ type: 'tool_result', toolCallId: msg.tool_call_id, result: resultContent });
            }
            continue;
          }
          const reasoning = msg?.additional_kwargs?.reasoning_content;
          if (reasoning && typeof reasoning === 'string' && onChunk) {
            onChunk({ type: 'thinking', text: reasoning });
          }
          if (msg?.content && typeof msg.content === 'string') {
            fullText += msg.content;
            if (onChunk) onChunk({ type: 'text', text: msg.content });
          }
          if (msg?.tool_calls?.length) {
            for (const tc of msg.tool_calls) {
              if (onChunk) {
                onChunk({
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id || `call_${Date.now()}`,
                    name: tc.name,
                    arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
                  },
                });
              }
            }
          }
        }
      }
    }

    if (onChunk) onChunk({ type: 'done' });
  } catch (err) {
    if (onChunk) onChunk({ type: 'error', error: err?.message || String(err) });
    throw err;
  }

  return fullText;
}

/**
 * Run agent without streaming (for WhatsApp / batch).
 * @returns {Promise<{ response: string }>}
 */
async function runLangGraphAgentSync(opts) {
  let fullResponse = '';
  const onChunk = (data) => {
    if (data?.type === 'text' && data.text) fullResponse += data.text;
  };
  fullResponse = await invokeLangGraphAgent({ ...opts, onChunk });
  return { response: fullResponse };
}

module.exports = {
  invokeLangGraphAgent,
  runLangGraphAgentSync,
  createLangChainToolsFromOpenAIDefinitions,
};
