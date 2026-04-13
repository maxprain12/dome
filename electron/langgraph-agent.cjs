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

/**
 * Emit text, extracting <think>...</think> blocks as separate 'thinking' chunks.
 * Models like MiniMax M2.5 embed chain-of-thought inline in the response text.
 */
function emitTextWithThinking(text, onChunk) {
  if (!onChunk || !text) return;
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      onChunk({ type: 'text', text: text.slice(lastIndex, match.index).trimStart() });
    }
    if (match[1].trim()) {
      onChunk({ type: 'thinking', text: match[1] });
    }
    lastIndex = match.index + match[0].length;
  }
  const remaining = lastIndex < text.length ? text.slice(lastIndex) : '';
  if (remaining.trim()) {
    onChunk({ type: 'text', text: remaining.trimStart() });
  }
}

function pickTokenNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const v = obj[k];
    if (v != null && Number.isFinite(Number(v))) return Math.max(0, Math.floor(Number(v)));
  }
  return null;
}

function extractUsageFromAiMessage(msg) {
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
  return {
    inputTokens: i,
    outputTokens: o,
    totalTokens: total ?? i + o,
  };
}

/**
 * Sum token usage across all AI messages in a LangGraph invoke result (defensive / multi-provider).
 * @param {unknown[]} resultMessages
 * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number } | null}
 */
function aggregateUsageFromMessages(resultMessages) {
  if (!Array.isArray(resultMessages)) return null;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let any = false;
  for (let i = 0; i < resultMessages.length; i += 1) {
    const msg = resultMessages[i];
    if (!msg || typeof msg._getType !== 'function') continue;
    if (msg._getType() !== 'ai') continue;
    const u = extractUsageFromAiMessage(msg);
    if (!u) continue;
    any = true;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    totalTokens += u.totalTokens;
  }
  if (!any) return null;
  return { inputTokens, outputTokens, totalTokens };
}

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
      ...(apiKey ? { headers: { 'Authorization': `Bearer ${apiKey}` } } : {}),
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
  if (provider === 'minimax') {
    const { ChatOpenAI } = await import('@langchain/openai');
    const { MINIMAX_OPENAI_BASE_URL } = require('./minimax-config.cjs');
    return new ChatOpenAI({
      model: model || 'MiniMax-M2.5',
      apiKey: apiKey,
      configuration: { baseURL: MINIMAX_OPENAI_BASE_URL },
      temperature: 0.7,
    });
  }
  if (provider === 'dome') {
    const { ChatOpenAI } = await import('@langchain/openai');
    return new ChatOpenAI({
      model: model || 'dome/auto',
      apiKey: apiKey,
      configuration: { baseURL: baseUrl },
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
    return trimmed;
  } catch (e) {
    console.warn('[AI LangGraph] Ollama trim failed, using full history:', e?.message);
    return messages;
  }
}

const CALENDAR_HITL_TOOLS = {
  calendar_create_event: true,
  calendar_update_event: true,
  calendar_delete_event: true,
};

function buildHitlInterruptOn(skipHitl, useDirectTools) {
  if (skipHitl) {
    return {
      call_writer_agent: false,
      call_data_agent: false,
      calendar_create_event: false,
      calendar_update_event: false,
      calendar_delete_event: false,
    };
  }
  if (useDirectTools) {
    return {
      call_writer_agent: false,
      call_data_agent: false,
      ...CALENDAR_HITL_TOOLS,
    };
  }
  return {
    call_writer_agent: true,
    call_data_agent: true,
    ...CALENDAR_HITL_TOOLS,
  };
}

/**
 * Shared agent graph for invoke + resume (must match checkpoint thread).
 * @param {import('@langchain/core').BaseChatModel} llm
 */
async function createConfiguredLangGraphAgent(llm, opts) {
  const { createAgent, humanInTheLoopMiddleware } = await import('langchain');
  const {
    useDirectTools,
    toolDefinitions,
    mcpServerIds,
    subagentIds,
    skipHitl,
    onChunk,
    threadId,
    automationProjectId,
  } = opts;

  const toolContext = automationProjectId ? { automationProjectId } : null;

  const rtEmittedCallIds = new Set();
  const rtEmittedResultIds = new Set();
  let rtCallCounter = 0;

  let tools;
  if (useDirectTools) {
    const executeFn = async (name, args) => {
      const id = `rt_${threadId || 'x'}_${++rtCallCounter}`;
      rtEmittedCallIds.add(id);
      if (onChunk) {
        onChunk({
          type: 'tool_call',
          toolCall: {
            id,
            name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args || {}),
          },
        });
      }
      const result = await executeToolInMain(name, args, toolContext);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      if (onChunk) onChunk({ type: 'tool_result', toolCallId: id, result: resultStr });
      rtEmittedResultIds.add(id);
      return result;
    };
    const directTools = toolDefinitions?.length
      ? await createLangChainToolsFromOpenAIDefinitions(toolDefinitions, executeFn)
      : [];
    const mcpTools = await getMCPTools(database, mcpServerIds);
    tools = [...directTools, ...mcpTools];
  } else {
    const subagentTools = await createSubagentTools(
      llm,
      createLangChainToolsFromOpenAIDefinitions,
      onChunk,
      subagentIds,
      toolContext,
    );
    const mcpTools = Array.isArray(mcpServerIds)
      ? (mcpServerIds.length > 0 ? await getMCPTools(database, mcpServerIds) : [])
      : await getMCPTools(database);
    const mainAgentDefs = [
      {
        type: 'function',
        function: {
          name: 'get_tool_definition',
          description:
            'Get the full schema of any tool (Dome or MCP). Use when you need to see exact parameters before calling a tool. Reduces token usage.',
          parameters: {
            type: 'object',
            properties: {
              tool_name: { type: 'string', description: 'Normalized tool name (e.g. resource_search, stripe_create_payment)' },
            },
            required: ['tool_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'remember_fact',
          description: 'Save an important fact about the user to long-term memory. Use this when you learn something relevant: name, preferences, work topics, communication style, goals.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short label for the memory (e.g. "user_name", "preferred_language", "research_topic")' },
              value: { type: 'string', description: 'The fact to remember' },
            },
            required: ['key', 'value'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_create',
          description:
            'Create a new specialized agent (hijo de Many) with a custom system prompt and tools. Use when the user asks to create, build, or set up a new AI agent. Do NOT delegate to subagents—call agent_create directly.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the agent (e.g. "Research Assistant", "Noticiero")' },
              description: { type: 'string', description: 'Short description of what this agent does' },
              system_instructions: { type: 'string', description: 'System prompt for the agent. Describe WHAT the agent will do when invoked. Be specific.' },
              tool_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'REQUIRED. Tool IDs the agent needs (e.g. ["web_fetch", "resource_create"]). Agent cannot work without tools. Never omit.',
              },
              icon_index: { type: 'number', description: 'Icon index 1-18. Default: random' },
            },
            required: ['name', 'tool_ids'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'automation_create',
          description:
            'Create an automation that runs an agent or workflow on a trigger (manual, schedule, or contextual). Dome has native automations—use this, never mention n8n or Make. Use when the user asks to automate, schedule, or set up recurring tasks. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Name of the automation (e.g. "Daily briefing")' },
              description: { type: 'string', description: 'What this automation does' },
              target_type: { type: 'string', description: 'Target: "agent" or "workflow"' },
              target_id: { type: 'string', description: 'ID of the target agent or workflow' },
              trigger_type: { type: 'string', description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual' },
              prompt: { type: 'string', description: 'Base prompt/instructions to pass when triggered' },
              schedule: {
                type: 'object',
                description: 'For trigger_type "schedule". cadence: "daily"|"weekly"|"cron-lite", hour: 0-23, weekday: 1-7 (for weekly), interval_minutes (for cron-lite)',
                properties: {
                  cadence: { type: 'string', enum: ['daily', 'weekly', 'cron-lite'] },
                  hour: { type: 'number', description: 'Hour of day (0-23)' },
                  weekday: { type: 'number', description: 'Day of week 1-7 for weekly' },
                  interval_minutes: { type: 'number', description: 'Minutes between runs for cron-lite' },
                },
              },
              output_mode: { type: 'string', description: '"chat_only" | "note" | "studio_output" | "mixed". Use "note" when agent creates a resource' },
              enabled: { type: 'boolean', description: 'Whether active. Default: true' },
            },
            required: ['title', 'target_id'],
          },
        },
      },
    ];
    const mainAgentTools = await createLangChainToolsFromOpenAIDefinitions(mainAgentDefs, (name, args) =>
      executeToolInMain(name, args, toolContext),
    );
    tools = [...subagentTools, ...mcpTools, ...mainAgentTools];
  }

  const interruptOn = buildHitlInterruptOn(skipHitl, useDirectTools);
  const hitlMiddleware = humanInTheLoopMiddleware({
    interruptOn,
    descriptionPrefix: 'Acción pendiente de aprobación',
  });
  const middleware = skipHitl ? [] : [hitlMiddleware];

  const agent = createAgent({
    model: llm,
    tools,
    middleware,
    checkpointer: getSharedCheckpointer(),
  });

  return { agent, rtEmittedCallIds, rtEmittedResultIds };
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
    onChunk,
    signal,
    threadId,
    skipHitl,
    automationProjectId,
  } = opts;

  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);

  const useDirectTools = opts.useDirectTools === true;
  const mcpServerIds = opts.mcpServerIds;
  const subagentIds = Array.isArray(opts.subagentIds) ? opts.subagentIds : undefined;

  const { agent, rtEmittedCallIds, rtEmittedResultIds } = await createConfiguredLangGraphAgent(llm, {
    useDirectTools,
    toolDefinitions: opts.toolDefinitions,
    mcpServerIds,
    subagentIds,
    skipHitl,
    onChunk,
    threadId,
    automationProjectId,
  });

  let lcMessages = await toLangChainMessages(messages);
  if (provider === 'ollama' && lcMessages.length > 0) {
    lcMessages = await trimMessagesForOllama(lcMessages, llm);
  }

  const config = {
    configurable: { thread_id: threadId || `dome_${Date.now()}` },
    recursionLimit: 100, // Aumentado desde el default 25 para tareas Excel con muchas filas
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

    // Emit tool calls and tool results in message order for UI cards.
    // Skip only the IDs already emitted in real-time so MCP tools can still surface.
    const resultMessages = result?.messages || [];
    for (const msg of resultMessages) {
      if (!msg || typeof msg._getType !== 'function') continue;
      const msgType = msg._getType();
      if (msgType === 'ai' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const toolCallId = tc.id || `call_${threadId || 'x'}_${++callCounter}`;
          if (rtEmittedCallIds.has(toolCallId)) continue;
          if (onChunk) {
            onChunk({
              type: 'tool_call',
              toolCall: {
                id: toolCallId,
                name: tc.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
              },
            });
          }
        }
      } else if ((msgType === 'tool' || msgType === 'ToolMessage') && msg.tool_call_id != null) {
        if (rtEmittedResultIds.has(msg.tool_call_id)) continue;
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
        emitTextWithThinking(textContent, onChunk);
      }
    }

    const aggregatedUsage = aggregateUsageFromMessages(resultMessages);
    if (aggregatedUsage && onChunk) {
      onChunk({ type: 'usage', usage: aggregatedUsage });
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
  const {
    threadId,
    decisions,
    useDirectTools: useDirectToolsArg,
    toolDefinitions: toolDefinitionsArg,
    mcpServerIds: mcpServerIdsArg,
    subagentIds: subagentIdsArg,
    skipHitl: skipHitlArg,
    automationProjectId: automationProjectIdArg,
    ...rest
  } = opts;
  if (!threadId || !decisions || !Array.isArray(decisions)) {
    throw new Error('resumeLangGraphAgent requires threadId and decisions array');
  }

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
  const useDirectTools = useDirectToolsArg === true;
  const mcpServerIds = mcpServerIdsArg;
  const subagentIds = Array.isArray(subagentIdsArg) ? subagentIdsArg : undefined;
  const skipHitl = skipHitlArg === true;
  const { agent } = await createConfiguredLangGraphAgent(llm, {
    useDirectTools,
    toolDefinitions: toolDefinitionsArg,
    mcpServerIds,
    subagentIds,
    skipHitl,
    onChunk,
    threadId,
    automationProjectId: automationProjectIdArg,
  });

  const config = {
    configurable: { thread_id: threadId },
    recursionLimit: 100, // Aumentado desde el default 25 para tareas Excel con muchas filas
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
        emitTextWithThinking(textContent, onChunk);
      }
    }

    const resumeAggregatedUsage = aggregateUsageFromMessages(resultMessages);
    if (resumeAggregatedUsage && onChunk) {
      onChunk({ type: 'usage', usage: resumeAggregatedUsage });
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
  aggregateUsageFromMessages,
};
