/* eslint-disable no-console */
/**
 * LangGraph Agent - Main Process
 *
 * Runs the chat with tools using LangGraph/createAgent.
 * Converts Dome's OpenAI-format tool definitions to LangChain tools,
 * creates a model from provider config, and streams results.
 *
 * Human-in-the-Loop (HITL): call_writer_agent and call_data_agent require
 * human approval. Uses MemorySaver checkpointer for interrupt/resume state.
 */

const aiChatWithTools = require('./ai-chat-with-tools.cjs');
const { executeToolInMain, getWhatsAppToolDefinitions } = aiChatWithTools;
const { createSubagentTools } = require('./subagents.cjs');
const { getMCPTools } = require('./mcp-client.cjs');
const database = require('./database.cjs');

/** Shared checkpointer for HITL so resume can find the checkpoint from the same thread */
let sharedCheckpointer = null;
function getSharedCheckpointer() {
  if (!sharedCheckpointer) {
    const { MemorySaver } = require('@langchain/langgraph-checkpoint');
    sharedCheckpointer = new MemorySaver();
  }
  return sharedCheckpointer;
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
      model: model || 'gemini-3-flash-preview',
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

  const { createAgent, humanInTheLoopMiddleware } = await import('langchain');

  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);

  // Subagents architecture: main agent (supervisor) has only subagent-invocation tools + MCP.
  const subagentTools = await createSubagentTools(llm, createLangChainToolsFromOpenAIDefinitions);
  const mcpTools = await getMCPTools(database);
  const tools = [...subagentTools, ...mcpTools];

  const hitlMiddleware = humanInTheLoopMiddleware({
    interruptOn: {
      call_writer_agent: true,
      call_data_agent: true,
    },
    descriptionPrefix: 'Acción pendiente de aprobación',
  });

  const agent = createAgent({
    model: llm,
    tools,
    middleware: [hitlMiddleware],
    checkpointer: getSharedCheckpointer(),
  });

  let lcMessages = await toLangChainMessages(messages);
  if (provider === 'ollama' && lcMessages.length > 0) {
    lcMessages = await trimMessagesForOllama(lcMessages, llm);
  }

  const config = {
    configurable: { thread_id: threadId || `dome_${Date.now()}` },
    signal,
  };

  let callCounter = 0;
  let fullText = '';

  try {
    // Use invoke (non-streaming) to avoid streamMode chunk format complexity.
    const result = await agent.invoke({ messages: lcMessages }, config);

    // Check for HITL interrupt (graph paused waiting for human decision)
    // LangChain puts interrupt on result.__interrupt__; fallback to getState for compatibility
    let interrupts = null;
    let interruptSource = '';
    try {
      if (result?.__interrupt__ && Array.isArray(result.__interrupt__) && result.__interrupt__.length > 0) {
        interrupts = result.__interrupt__;
        interruptSource = 'result';
      }
      if (!interrupts) {
        const state = await agent.getState(config);
        const fromState = state?.values?.__interrupt__ ?? state?.__interrupt__;
        if (fromState && Array.isArray(fromState) && fromState.length > 0) {
          interrupts = fromState;
          interruptSource = 'state';
        }
      }
      if (interrupts) {
        const first = interrupts[0];
        const value = first?.value ?? first;
        const actionRequests = value?.actionRequests ?? value?.action_requests ?? [];
        const reviewConfigs = value?.reviewConfigs ?? value?.review_configs ?? [];
        const safeActionRequests = Array.isArray(actionRequests) ? actionRequests : [];
        const safeReviewConfigs = Array.isArray(reviewConfigs) ? reviewConfigs : [];
        console.log(`[AI LangGraph] HITL interrupt detected (${interruptSource}), ${safeActionRequests.length} action(s)`);
        if (onChunk) {
          onChunk({
            type: 'interrupt',
            threadId: config.configurable.thread_id,
            actionRequests: safeActionRequests,
            reviewConfigs: safeReviewConfigs,
          });
        }
        return { __interrupt__: true, threadId: config.configurable.thread_id };
      }
    } catch (e) {
      // getState can fail if no checkpoint; ignore
    }

    // Emit tool calls and tool results in message order for UI cards
    const resultMessages = result?.messages || [];
    for (const msg of resultMessages) {
      if (!msg || typeof msg._getType !== 'function') continue;
      const msgType = msg._getType();
      if (msgType === 'ai' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          if (onChunk) {
            onChunk({
              type: 'tool_call',
              toolCall: {
                id: tc.id || `call_${threadId || 'x'}_${++callCounter}`,
                name: tc.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
              },
            });
          }
        }
      } else if ((msgType === 'tool' || msgType === 'ToolMessage') && msg.tool_call_id != null) {
        let resultContent = msg.content;
        if (typeof resultContent !== 'string') {
          try { resultContent = JSON.stringify(resultContent); } catch { resultContent = String(resultContent); }
        }
        if (onChunk) onChunk({ type: 'tool_result', toolCallId: msg.tool_call_id, result: resultContent });
      }
    }

    // Extract the final AI message as the response text
    const lastAI = [...resultMessages].reverse().find((m) => m && typeof m._getType === 'function' && m._getType() === 'ai');
    if (lastAI) {
      const rawContent = lastAI.content;
      let textContent = '';
      if (typeof rawContent === 'string') {
        textContent = rawContent;
      } else if (Array.isArray(rawContent)) {
        textContent = rawContent
          .filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('');
      }
      if (textContent) {
        fullText = textContent;
        if (onChunk) onChunk({ type: 'text', text: textContent });
      }
    }

    if (onChunk) onChunk({ type: 'done' });
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
    if (onChunk) {
      if (isAbort) {
        onChunk({ type: 'done' });
      } else {
        onChunk({ type: 'error', error: err?.message || String(err) });
      }
    }
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

/**
 * Resume LangGraph agent after HITL interrupt.
 * Invokes with Command({ resume: { decisions } }) and streams the continuation.
 * @param {Object} opts - Same as invokeLangGraphAgent plus { threadId, decisions }
 * @returns {Promise<string>} Final response text, or { __interrupt__: true } if another interrupt
 */
async function resumeLangGraphAgent(opts) {
  const { threadId, decisions, ...rest } = opts;
  if (!threadId || !decisions || !Array.isArray(decisions)) {
    throw new Error('resumeLangGraphAgent requires threadId and decisions array');
  }

  const { createAgent, humanInTheLoopMiddleware } = await import('langchain');
  const { Command } = await import('@langchain/langgraph');

  const {
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    onChunk,
    signal,
  } = rest;

  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);
  const subagentTools = await createSubagentTools(llm, createLangChainToolsFromOpenAIDefinitions);
  const mcpTools = await getMCPTools(database);
  const tools = [...subagentTools, ...mcpTools];

  const hitlMiddleware = humanInTheLoopMiddleware({
    interruptOn: { call_writer_agent: true, call_data_agent: true },
    descriptionPrefix: 'Acción pendiente de aprobación',
  });

  const agent = createAgent({
    model: llm,
    tools,
    middleware: [hitlMiddleware],
    checkpointer: getSharedCheckpointer(),
  });

  const config = {
    configurable: { thread_id: threadId },
    signal,
  };

  let callCounter = 0;
  let fullText = '';

  try {
    // Use invoke (non-streaming) to avoid streamMode chunk format complexity.
    const result = await agent.invoke(new Command({ resume: { decisions } }), config);

    // Check for HITL interrupt after resume (result first, then state)
    let resumeInterrupts = null;
    let resumeInterruptSource = '';
    try {
      if (result?.__interrupt__ && Array.isArray(result.__interrupt__) && result.__interrupt__.length > 0) {
        resumeInterrupts = result.__interrupt__;
        resumeInterruptSource = 'result';
      }
      if (!resumeInterrupts) {
        const state = await agent.getState(config);
        const fromState = state?.values?.__interrupt__ ?? state?.__interrupt__;
        if (fromState && Array.isArray(fromState) && fromState.length > 0) {
          resumeInterrupts = fromState;
          resumeInterruptSource = 'state';
        }
      }
      if (resumeInterrupts) {
        const first = resumeInterrupts[0];
        const value = first?.value ?? first;
        const actionRequests = value?.actionRequests ?? value?.action_requests ?? [];
        const reviewConfigs = value?.reviewConfigs ?? value?.review_configs ?? [];
        const safeActionRequests = Array.isArray(actionRequests) ? actionRequests : [];
        const safeReviewConfigs = Array.isArray(reviewConfigs) ? reviewConfigs : [];
        console.log(`[AI LangGraph] HITL interrupt after resume (${resumeInterruptSource}), ${safeActionRequests.length} action(s)`);
        if (onChunk) {
          onChunk({
            type: 'interrupt',
            threadId,
            actionRequests: safeActionRequests,
            reviewConfigs: safeReviewConfigs,
          });
        }
        return { __interrupt__: true, threadId };
      }
    } catch (e) {
      // getState can fail; ignore
    }

    // Emit tool calls and tool results in message order for UI cards
    const resultMessages = result?.messages || [];
    for (const msg of resultMessages) {
      if (!msg || typeof msg._getType !== 'function') continue;
      const msgType = msg._getType();
      if (msgType === 'ai' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          if (onChunk) {
            onChunk({
              type: 'tool_call',
              toolCall: {
                id: tc.id || `call_${threadId}_${++callCounter}`,
                name: tc.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
              },
            });
          }
        }
      } else if ((msgType === 'tool' || msgType === 'ToolMessage') && msg.tool_call_id != null) {
        let resultContent = msg.content;
        if (typeof resultContent !== 'string') {
          try { resultContent = JSON.stringify(resultContent); } catch { resultContent = String(resultContent); }
        }
        if (onChunk) onChunk({ type: 'tool_result', toolCallId: msg.tool_call_id, result: resultContent });
      }
    }

    // Extract the final AI message as the response text
    const lastAI = [...resultMessages].reverse().find((m) => m && typeof m._getType === 'function' && m._getType() === 'ai');
    if (lastAI) {
      const rawContent = lastAI.content;
      let textContent = '';
      if (typeof rawContent === 'string') {
        textContent = rawContent;
      } else if (Array.isArray(rawContent)) {
        textContent = rawContent
          .filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('');
      }
      if (textContent) {
        fullText = textContent;
        if (onChunk) onChunk({ type: 'text', text: textContent });
      }
    }

    if (onChunk) onChunk({ type: 'done' });
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
    if (onChunk) {
      if (isAbort) onChunk({ type: 'done' });
      else onChunk({ type: 'error', error: err?.message || String(err) });
    }
    throw err;
  }

  return fullText;
}

module.exports = {
  invokeLangGraphAgent,
  resumeLangGraphAgent,
  runLangGraphAgentSync,
  createLangChainToolsFromOpenAIDefinitions,
};
