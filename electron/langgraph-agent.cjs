/* eslint-disable no-console */
/**
 * LangGraph Agent - Main Process
 *
 * Runs the chat with tools using LangGraph/createAgent.
 * Converts Dome's OpenAI-format tool definitions to LangChain tools,
 * creates a model from provider config, and streams results.
 *
 * Human-in-the-Loop (HITL): call_writer_agent and call_data_agent require
 * human approval. Uses a durable SqliteSaver checkpointer so pending
 * interrupts survive app restarts (see ./checkpointer.cjs).
 */

const toolDispatcher = require('./tool-dispatcher.cjs');
const { executeToolInMain, getWhatsAppToolDefinitions } = toolDispatcher;
const { createSubagentTools } = require('./subagents.cjs');
const { getMCPTools } = require('./mcp-client.cjs');
const database = require('./database.cjs');
const { getDomeCheckpointer } = require('./checkpointer.cjs');
const { withLangfuseCallbacks } = require('./observability.cjs');

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
  return getDomeCheckpointer();
}

/**
 * Recursion limit for `createAgent`. Default is 25; raised to 100 for
 * Excel/sheet-style flows that loop over many rows. If you ever see
 * `GraphRecursionError` outside of a runaway loop, bump this — but first
 * confirm the agent isn't oscillating.
 */
const RECURSION_LIMIT = 100;

/** Streamed modes used for every agent run. See LangGraph docs for shapes. */
const STREAM_MODES = ['messages', 'updates', 'custom'];

/**
 * Node names that emit *top-level* assistant output we should forward to the
 * user. LangChain 1.x's `createAgent` uses `model_request`; earlier versions
 * used `agent`. We accept both so a langchain bump doesn't silently swallow
 * every reply. Subagents run as wrapped tools (`createSubagentTools`) via
 * their own `agent.invoke`, so they never appear in this stream — we don't
 * need to filter them out here, just allowlist the parent.
 */
const TOP_LEVEL_NODES = new Set(['agent', 'model_request']);

/**
 * Per-turn cap on calls to a single creation tool. Prevents runaway loops
 * (e.g. MiniMax-M2.7 generating 16 "Dashboard X" notes for one user ask)
 * even when the system prompt already says "one creation per request".
 * Tools listed here return a synthetic error after exceeding the cap; the
 * model sees the error and (per artifact/tools prompt guidance) replies
 * to the user instead of looping further.
 *
 * Tools NOT in this map are uncapped — read tools (resource_search,
 * resource_get, web_search…) and structural ops can legitimately fire
 * many times in a complex workflow.
 */
const CREATION_TOOL_CAPS = {
  resource_create: 5,
  resource_update: 8,
  resource_delete: 5,
  ppt_create: 2,
  flashcard_create: 3,
  generate_quiz: 2,
  generate_mindmap: 2,
  generate_guide: 2,
  generate_faq: 2,
  generate_timeline: 2,
  generate_table: 2,
  generate_audio_overview: 2,
  generate_video_overview: 2,
  notebook_add_cell: 30,
  pdf_annotation_create: 30,
  link_resources: 20,
};

function makeToolCallCounter() {
  const counts = new Map();
  return {
    /** Returns null if allowed, or an error string if the cap was hit. */
    check(name) {
      const cap = CREATION_TOOL_CAPS[name];
      if (typeof cap !== 'number') return null;
      const used = counts.get(name) || 0;
      if (used >= cap) {
        return (
          `Tool "${name}" has been called ${used} times in this turn — ` +
          `that's the per-turn cap (${cap}). STOP calling this tool. ` +
          `Reply to the user now with a summary of what you've already produced. ` +
          `If they wanted multiple variants they will ask explicitly.`
        );
      }
      counts.set(name, used + 1);
      return null;
    },
  };
}

/**
 * Stateful parser for `<think>...</think>` blocks streamed across chunks
 * (MiniMax M2.5, DeepSeek-style models). Tokens may split tags mid-bracket,
 * so we buffer suspicious partial tags and only emit complete segments.
 */
function createThinkingStreamParser(onChunk) {
  let buffer = '';
  let mode = 'text'; // 'text' | 'inThink'

  function emit(type, text) {
    if (text && onChunk) onChunk({ type, text });
  }

  return {
    push(delta) {
      if (!delta) return;
      buffer += delta;
      // Drain the buffer until we either consume it all or hold a partial tag.
      while (buffer.length > 0) {
        const openTag = '<think>';
        const closeTag = '</think>';
        const target = mode === 'text' ? openTag : closeTag;
        const idx = buffer.indexOf(target);
        if (idx >= 0) {
          if (idx > 0) emit(mode === 'text' ? 'text' : 'thinking', buffer.slice(0, idx));
          buffer = buffer.slice(idx + target.length);
          mode = mode === 'text' ? 'inThink' : 'text';
          continue;
        }
        // No full tag — see if the tail could be a partial tag we should hold.
        const lt = buffer.lastIndexOf('<');
        if (lt >= 0 && target.startsWith(buffer.slice(lt))) {
          if (lt > 0) emit(mode === 'text' ? 'text' : 'thinking', buffer.slice(0, lt));
          buffer = buffer.slice(lt);
          return;
        }
        emit(mode === 'text' ? 'text' : 'thinking', buffer);
        buffer = '';
        return;
      }
    },
    finish() {
      if (buffer.length > 0) {
        emit(mode === 'text' ? 'text' : 'thinking', buffer);
        buffer = '';
      }
    },
  };
}

/**
 * Pull pending HITL interrupts from a captured updates-mode blob first
 * (cheap, in-memory), then fall back to `agent.getState(config)`. With the
 * SqliteSaver checkpointer, getState is the durable source of truth across
 * restarts; the captured blob just avoids an extra round-trip.
 */
async function extractInterrupt(capturedInterrupt, agent, config) {
  let interrupts = null;
  if (Array.isArray(capturedInterrupt) && capturedInterrupt.length > 0) {
    interrupts = capturedInterrupt;
  }
  if (!interrupts) {
    try {
      const state = await agent.getState(config);
      const fromState = state?.values?.__interrupt__ ?? state?.__interrupt__;
      if (Array.isArray(fromState) && fromState.length > 0) interrupts = fromState;
    } catch {
      /* getState may fail with no checkpoint; treat as no interrupt */
    }
  }
  if (!interrupts) return null;
  const first = interrupts[0];
  const value = first?.value ?? first;
  const actionRequests = value?.actionRequests ?? value?.action_requests ?? [];
  const reviewConfigs = value?.reviewConfigs ?? value?.review_configs ?? [];
  return {
    actionRequests: Array.isArray(actionRequests) ? actionRequests : [],
    reviewConfigs: Array.isArray(reviewConfigs) ? reviewConfigs : [],
  };
}

/**
 * Stream a LangGraph agent run, emitting `text` / `thinking` / `tool_call`
 * / `tool_result` chunks in real time. Dedupes against tool IDs already
 * surfaced by the OpenAI-format tool wrapper (`useDirectTools` mode).
 *
 * Returns the captured `__interrupt__` blob (if any) so the caller can
 * decide whether to emit an interrupt chunk or keep going.
 */
async function streamAgentRun(agent, input, config, onChunk, rtEmittedCallIds, rtEmittedResultIds) {
  const seenToolCallIds = new Set();
  const seenToolResultIds = new Set();
  const parser = createThinkingStreamParser(onChunk);
  let capturedInterrupt = null;

  const trace = process.env.DOME_LANGGRAPH_TRACE === '1';
  const traceStart = trace ? Date.now() : 0;
  const traceTag = trace ? `[LG ${(config?.configurable?.thread_id || '?').toString().slice(-8)}]` : '';

  const stream = await agent.stream(input, { ...config, streamMode: STREAM_MODES });
  for await (const [mode, chunk] of stream) {
    if (trace) {
      const elapsed = Date.now() - traceStart;
      let preview = '';
      try {
        if (mode === 'messages') {
          const m = Array.isArray(chunk) ? chunk[0] : chunk;
          const t = (m && typeof m._getType === 'function') ? m._getType() : 'unknown';
          const c = m && m.content;
          const text = typeof c === 'string' ? c : JSON.stringify(c);
          preview = `msg(${t}) ${(text || '').slice(0, 80)}`;
        } else if (mode === 'updates') {
          preview = `nodes=${Object.keys(chunk || {}).join(',')}`;
        } else if (mode === 'custom') {
          preview = `custom ${chunk?.type || 'unknown'}`;
        }
      } catch { /* ignore preview errors */ }
      console.log(`${traceTag} +${elapsed}ms mode=${mode} ${preview}`);
    }
    if (mode === 'messages') {
      const msgChunk = Array.isArray(chunk) ? chunk[0] : chunk;
      const metadata = Array.isArray(chunk) ? chunk[1] : null;
      if (!msgChunk || typeof msgChunk._getType !== 'function') continue;
      if (msgChunk._getType() !== 'ai') continue;
      // Only stream the top-level agent's output. Accept both the legacy
      // `agent` node and the langchain 1.x `model_request` node — without
      // this, the entire reply is silently dropped after a langchain bump.
      if (
        metadata
        && metadata.langgraph_node
        && !TOP_LEVEL_NODES.has(metadata.langgraph_node)
      ) continue;
      const content = msgChunk.content;
      if (typeof content === 'string' && content) {
        parser.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && typeof block.text === 'string' && block.text) {
            parser.push(block.text);
          } else if ((block.type === 'thinking' || block.type === 'reasoning') && typeof block.text === 'string' && block.text) {
            if (onChunk) onChunk({ type: 'thinking', text: block.text });
          }
        }
      }
    } else if (mode === 'updates') {
      if (!chunk || typeof chunk !== 'object') continue;
      if (Array.isArray(chunk.__interrupt__) && chunk.__interrupt__.length > 0) {
        capturedInterrupt = chunk.__interrupt__;
        continue;
      }
      for (const nodeName of Object.keys(chunk)) {
        if (nodeName === '__interrupt__') continue;
        const delta = chunk[nodeName];
        const messages = delta?.messages;
        if (!Array.isArray(messages)) continue;
        for (const msg of messages) {
          if (!msg || typeof msg._getType !== 'function') continue;
          const t = msg._getType();
          if (t === 'ai' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            for (const tc of msg.tool_calls) {
              const id = tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              if (seenToolCallIds.has(id) || rtEmittedCallIds?.has(id)) continue;
              seenToolCallIds.add(id);
              if (onChunk) {
                onChunk({
                  type: 'tool_call',
                  toolCall: {
                    id,
                    name: tc.name,
                    arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
                  },
                });
              }
            }
          } else if ((t === 'tool' || t === 'ToolMessage') && msg.tool_call_id != null) {
            const id = msg.tool_call_id;
            if (seenToolResultIds.has(id) || rtEmittedResultIds?.has(id)) continue;
            seenToolResultIds.add(id);
            let resultContent = msg.content;
            if (typeof resultContent !== 'string') {
              try { resultContent = JSON.stringify(resultContent); } catch { resultContent = String(resultContent); }
            }
            if (onChunk) onChunk({ type: 'tool_result', toolCallId: id, result: resultContent });
          }
        }
      }
    } else if (mode === 'custom') {
      // Reserved for tools that report progress via `config.writer`. Pass
      // through any well-shaped chunk so callers can render progress UI.
      if (chunk && typeof chunk === 'object' && typeof chunk.type === 'string' && onChunk) {
        onChunk(chunk);
      }
    }
  }

  parser.finish();
  return { capturedInterrupt };
}

/**
 * After a stream completes, pull the final assistant text from the
 * checkpointed state. We intentionally read state (not the streamed tokens)
 * so callers like WhatsApp get the canonical last AI message even when the
 * agent emitted intermediate "thinking out loud" turns.
 */
async function finalizeFromState(agent, config) {
  let finalText = '';
  let finalMessages = [];
  try {
    const state = await agent.getState(config);
    finalMessages = state?.values?.messages || state?.messages || [];
    const lastAI = [...finalMessages].reverse().find(
      (m) => m && typeof m._getType === 'function' && m._getType() === 'ai',
    );
    if (lastAI) {
      const rawContent = lastAI.content;
      if (typeof rawContent === 'string') {
        finalText = rawContent;
      } else if (Array.isArray(rawContent)) {
        finalText = rawContent
          .filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('');
      }
    }
  } catch {
    /* getState may fail if no checkpoint; return empty */
  }
  return { finalText, finalMessages };
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
 * Per-provider token budgets used by the trimming middleware. Generous on
 * the cloud providers (we still leave headroom for tool definitions +
 * system prompt), tight on Ollama because most local models cap at 8K.
 *
 * If you bump these, remember the *real* limit for the model in question
 * — exceeding it produces silent context truncation on the server side
 * (OpenAI) or hard 4xx errors (Anthropic).
 */
const PROVIDER_TOKEN_BUDGETS = {
  ollama: 8192,
  openai: 96000,
  anthropic: 160000,
  google: 800000,
  minimax: 160000,
  dome: 64000,
};

const DEFAULT_TOKEN_BUDGET = 64000;

/**
 * Build a middleware that trims `request.messages` to fit the provider's
 * token budget on every model call. Runs inside the agent loop, so it
 * also catches growth from intermediate tool turns — not just the
 * initial input. Falls back to the untrimmed messages on counter errors
 * (some non-OpenAI models lack a token counter).
 */
async function createTrimmingMiddleware(provider, llm) {
  const { createMiddleware } = await import('langchain');
  const { trimMessages } = await import('@langchain/core/messages');
  const maxTokens = PROVIDER_TOKEN_BUDGETS[provider] ?? DEFAULT_TOKEN_BUDGET;

  return createMiddleware({
    name: 'DomeTrimMessages',
    async wrapModelCall(request, handler) {
      const original = request.messages;
      if (!Array.isArray(original) || original.length === 0) return handler(request);
      try {
        const trimmed = await trimMessages(original, {
          maxTokens,
          tokenCounter: llm,
          strategy: 'last',
          includeSystem: true,
          startOn: 'human',
          endOn: ['human', 'tool'],
        });
        if (trimmed.length < original.length) {
          console.log(`[AI LangGraph] trimmed ${original.length - trimmed.length} messages → ${trimmed.length} (budget ${maxTokens}, ${provider})`);
        }
        return handler({ ...request, messages: trimmed });
      } catch (e) {
        console.warn(`[AI LangGraph] ${provider} trim failed, using full history:`, e?.message);
        return handler(request);
      }
    },
  });
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
    provider,
    customTools,
  } = opts;

  const toolContext = automationProjectId ? { automationProjectId } : null;

  const rtEmittedCallIds = new Set();
  const rtEmittedResultIds = new Set();
  let rtCallCounter = 0;
  const callCounter = makeToolCallCounter();

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
      const capError = callCounter.check(name);
      if (capError) {
        if (onChunk) onChunk({ type: 'tool_result', toolCallId: id, result: capError });
        rtEmittedResultIds.add(id);
        return { error: capError };
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
    const mainAgentTools = await createLangChainToolsFromOpenAIDefinitions(mainAgentDefs, async (name, args) => {
      const capError = callCounter.check(name);
      if (capError) return { error: capError };
      return executeToolInMain(name, args, toolContext);
    });
    tools = [...subagentTools, ...mcpTools, ...mainAgentTools];
  }

  if (Array.isArray(customTools) && customTools.length > 0) {
    tools = [...tools, ...customTools];
  }

  const interruptOn = buildHitlInterruptOn(skipHitl, useDirectTools);
  const hitlMiddleware = humanInTheLoopMiddleware({
    interruptOn,
    descriptionPrefix: 'Acción pendiente de aprobación',
  });
  const trimMiddleware = await createTrimmingMiddleware(provider, llm);
  // Order matters: trim runs first so HITL/tool decisions see the trimmed
  // history. HITL only intercepts tool calls, not the input messages, so
  // the order doesn't change correctness — but it keeps the LLM call cheap.
  const middleware = skipHitl ? [trimMiddleware] : [trimMiddleware, hitlMiddleware];

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
    provider,
    customTools: opts.customTools,
  });

  // Trimming is handled inside the graph by `DomeTrimMessages` middleware so
  // that intermediate tool turns also stay within the provider budget.
  const lcMessages = await toLangChainMessages(messages);

  const config = withLangfuseCallbacks({
    configurable: { thread_id: threadId || `dome_${Date.now()}` },
    recursionLimit: RECURSION_LIMIT,
    signal,
  });

  try {
    const { capturedInterrupt } = await streamAgentRun(
      agent,
      { messages: lcMessages },
      config,
      onChunk,
      rtEmittedCallIds,
      rtEmittedResultIds,
    );

    const interrupt = await extractInterrupt(capturedInterrupt, agent, config);
    if (interrupt) {
      if (onChunk) {
        onChunk({
          type: 'interrupt',
          threadId: config.configurable.thread_id,
          actionRequests: interrupt.actionRequests,
          reviewConfigs: interrupt.reviewConfigs,
        });
      }
      return { __interrupt__: true, threadId: config.configurable.thread_id };
    }

    const { finalText, finalMessages } = await finalizeFromState(agent, config);

    const aggregatedUsage = aggregateUsageFromMessages(finalMessages);
    if (aggregatedUsage && onChunk) {
      onChunk({ type: 'usage', usage: aggregatedUsage });
    }
    if (onChunk) onChunk({ type: 'done' });

    return finalText;
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
    customTools: customToolsArg,
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
  const { agent, rtEmittedCallIds, rtEmittedResultIds } = await createConfiguredLangGraphAgent(llm, {
    useDirectTools,
    toolDefinitions: toolDefinitionsArg,
    mcpServerIds,
    subagentIds,
    skipHitl,
    onChunk,
    threadId,
    automationProjectId: automationProjectIdArg,
    provider,
    customTools: customToolsArg,
  });

  const config = withLangfuseCallbacks({
    configurable: { thread_id: threadId },
    recursionLimit: RECURSION_LIMIT,
    signal,
  });

  try {
    const { capturedInterrupt } = await streamAgentRun(
      agent,
      new Command({ resume: { decisions } }),
      config,
      onChunk,
      rtEmittedCallIds,
      rtEmittedResultIds,
    );

    const interrupt = await extractInterrupt(capturedInterrupt, agent, config);
    if (interrupt) {
      if (onChunk) {
        onChunk({
          type: 'interrupt',
          threadId,
          actionRequests: interrupt.actionRequests,
          reviewConfigs: interrupt.reviewConfigs,
        });
      }
      return { __interrupt__: true, threadId };
    }

    const { finalText, finalMessages } = await finalizeFromState(agent, config);

    const aggregatedUsage = aggregateUsageFromMessages(finalMessages);
    if (aggregatedUsage && onChunk) {
      onChunk({ type: 'usage', usage: aggregatedUsage });
    }
    if (onChunk) onChunk({ type: 'done' });

    return finalText;
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
    if (onChunk) {
      if (isAbort) onChunk({ type: 'done' });
      else onChunk({ type: 'error', error: err?.message || String(err) });
    }
    throw err;
  }
}

module.exports = {
  invokeLangGraphAgent,
  resumeLangGraphAgent,
  runLangGraphAgentSync,
  createLangChainToolsFromOpenAIDefinitions,
  aggregateUsageFromMessages,
};
