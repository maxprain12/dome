/* eslint-disable no-console */
/**
 * LangGraph Agent - Main Process
 *
 * Runs the chat with tools using LangGraph/createAgent.
 * Converts Dome's OpenAI-format tool definitions to LangChain tools,
 * creates a model from provider config, and streams results.
 *
 * Context engineering: optional LangChain summarizationMiddleware (disable with
 * DOME_LANGGRAPH_SUMMARIZATION=0), trim-by-token middleware, tool-result caps
 * (electron/tool-result-cap.cjs), typed runtimeContext (agent-runtime-context.cjs),
 * optional workspace AGENTS.md injected via project-memory.cjs, and truncated
 * file-based skills via deepagents createSkillsMiddleware.
 *
 * Human-in-the-Loop (HITL): call_writer_agent and call_data_agent require
 * human approval. Uses a durable SqliteSaver checkpointer so pending
 * interrupts survive app restarts (see ./checkpointer.cjs).
 *
 * Async subagent tools (start/check/update/cancel/list) run the same subagent
 * graphs in the background; see ./async-subagents.cjs.
 *
 * Streaming follows LangGraph JS `Pregel.stream` semantics (multi `streamMode`,
 * optional `subgraphs`). See:
 * https://docs.langchain.com/oss/javascript/langgraph/streaming
 */

const toolDispatcher = require('./tool-dispatcher.cjs');
const { executeToolInMain } = toolDispatcher;
const { createSubagentTools } = require('./subagents.cjs');
const { createAsyncSubagentTools } = require('./async-subagents.cjs');
const { getMCPTools } = require('./mcp-client.cjs');
const database = require('./database.cjs');
const { getDomeCheckpointer } = require('./checkpointer.cjs');
const { getDomeStore } = require('./agent-store.cjs');
const { withLangfuseCallbacks } = require('./observability.cjs');
const { measurePrompt } = require('./prompt-budget.cjs');
const { parseRuntimeContext } = require('./agent-runtime-context.cjs');
const projectMemory = require('./project-memory.cjs');
const { buildSkillsMiddleware } = require('./skills/index.cjs');
const { buildGuardrailsMiddleware } = require('./guardrails.cjs');
const { DOME_LOAD_DOC_DESCRIPTION } = require('./prompt-sections.cjs');
const { capToolResultString } = require('./tool-result-cap.cjs');

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

/** Default stream modes for every agent run (LangGraph `streamMode` array). */
const STREAM_MODES_BASE = ['messages', 'updates', 'custom'];

function streamModesForRun() {
  const modes = [...STREAM_MODES_BASE];
  // 'values' mode emits the full state snapshot on every step — useful for
  // time-travel and debugging. Enable with DOME_LANGGRAPH_STREAM_VALUES=1.
  if (process.env.DOME_LANGGRAPH_STREAM_VALUES === '1') modes.push('values');
  if (process.env.DOME_LANGGRAPH_STREAM_DEBUG === '1') modes.push('debug');
  return modes;
}

/**
 * When `subgraphs: true` and multiple modes are requested, LangGraph yields
 * `[namespace, mode, payload]`; otherwise `[mode, payload]`. Normalize so the
 * rest of the pipeline stays mode-first.
 * @param {unknown} raw
 * @returns {{ namespace: string[] | null, mode: string, chunk: unknown } | null}
 */
function peelLangGraphStreamTuple(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (raw.length >= 3) {
    const [namespace, mode, chunk] = raw;
    return {
      namespace: Array.isArray(namespace) ? namespace : null,
      mode: typeof mode === 'string' ? mode : String(mode),
      chunk,
    };
  }
  const [mode, chunk] = raw;
  return {
    namespace: null,
    mode: typeof mode === 'string' ? mode : String(mode),
    chunk,
  };
}

/**
 * Node names that emit *top-level* assistant output we should forward to the
 * user.
 *
 * LangGraph sets `metadata.langgraph_node` from the runnable's `call.name`:
 * ReactAgent registers the node as `model_request`, while `RunnableCallable`'s
 * default name for that node is `model`. If only `model_request`/`agent` were
 * allowlisted, every streamed token could be discarded (silent empty replies).
 *
 * Subagents run as wrapped tools (`createSubagentTools`) via their own
 * `agent.invoke`; they should not reuse these exact node identifiers in our
 * top-level Dome graph stream path.
 */
const TOP_LEVEL_NODES = new Set([
  'agent',
  'model_request',
  'model',
]);

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
  ppt_create: 3,
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
 * Secondary streaming detector for inline artifact blocks (2.18).
 *
 * As the agent streams text, this detector accumulates it and emits a
 * structured `custom` chunk (`{ type: 'artifact:structured', ... }`) the
 * moment a complete `` ```artifact:TYPE `` block is recognised.
 *
 * The text stream continues unchanged — backward compatibility is preserved.
 * The renderer can optionally consume the structured chunk instead of
 * re-parsing the markdown fence.
 */
function createArtifactBlockDetector(onChunk) {
  let accumulated = '';
  // Track which block positions have already been emitted.
  const emittedPositions = new Set();
  const FENCE_RE = /```artifact:([a-z_]+)\n([\s\S]*?)```/g;

  return {
    push(text) {
      if (!text || !onChunk) return;
      accumulated += text;
      FENCE_RE.lastIndex = 0;
      let match;
      while ((match = FENCE_RE.exec(accumulated)) !== null) {
        const pos = match.index;
        if (!emittedPositions.has(pos)) {
          emittedPositions.add(pos);
          try {
            const data = JSON.parse(match[2]);
            onChunk({ type: 'artifact:structured', artifactType: match[1], data });
          } catch {
            // JSON parse failed — skip; renderer falls back to text parsing.
          }
        }
      }
    },
    finish() {
      accumulated = '';
      emittedPositions.clear();
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
  const ar = Array.isArray(actionRequests) ? actionRequests : [];
  const rc = Array.isArray(reviewConfigs) ? reviewConfigs : [];
  // LangGraph may emit an __interrupt__ node with no pending actions; treating that as HITL
  // leaves runs stuck in waiting_approval with nothing to approve in the UI.
  if (ar.length === 0) return null;
  return { actionRequests: ar, reviewConfigs: rc };
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
  const artifactDetector = createArtifactBlockDetector(onChunk);
  let capturedInterrupt = null;

  const trace = process.env.DOME_LANGGRAPH_TRACE === '1';
  const traceStart = trace ? Date.now() : 0;
  const traceTag = trace ? `[LG ${(config?.configurable?.thread_id || '?').toString().slice(-8)}]` : '';

  const streamSubgraphs = process.env.DOME_LANGGRAPH_STREAM_SUBGRAPHS !== '0';
  const streamModes = streamModesForRun();
  const stream = await agent.stream(input, {
    ...config,
    streamMode: streamModes,
    subgraphs: streamSubgraphs,
  });
  for await (const raw of stream) {
    const peeled = peelLangGraphStreamTuple(raw);
    if (!peeled) continue;
    const { namespace: streamNamespace, mode, chunk } = peeled;

    if (trace) {
      const elapsed = Date.now() - traceStart;
      let preview = '';
      const ns =
        streamNamespace && streamNamespace.length > 0
          ? streamNamespace.join('>')
          : '';
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
        } else if (mode === 'debug') {
          preview = `debug ${typeof chunk === 'object' && chunk ? Object.keys(chunk).slice(0, 5).join(',') : ''}`;
        }
      } catch { /* ignore preview errors */ }
      const nsBit = ns ? ` ns=${ns}` : '';
      console.log(`${traceTag} +${elapsed}ms mode=${mode}${nsBit} ${preview}`);
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
        artifactDetector.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && typeof block.text === 'string' && block.text) {
            parser.push(block.text);
            artifactDetector.push(block.text);
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
    } else if (mode === 'debug') {
      if (process.env.DOME_LANGGRAPH_STREAM_DEBUG === '1') {
        try {
          const dbg = typeof chunk === 'object' && chunk !== null ? chunk : { value: chunk };
          const prefix = trace ? traceTag : '[LG debug]';
          console.log(prefix, JSON.stringify(dbg).slice(0, 800));
        } catch { /* ignore */ }
      }
    }
  }

  parser.finish();
  artifactDetector.finish();
  return { capturedInterrupt };
}

/**
 * After a stream completes, pull the final assistant text from the
 * checkpointed state. We intentionally read state (not the streamed tokens)
 * so callers like automations or batch jobs get the canonical last AI message even when the
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
      async (input, config) => {
        const result = await executeFn(normName, input || {}, config);
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      { name: normName, description: description || '', schema },
    );
    tools.push(lcTool);
  }
  return tools;
}

/**
 * Strip JSON Schema meta-fields that LangChain's Zod→JSON-Schema converter adds
 * ($schema, additionalProperties) but that MiniMax's OpenAI-compatible endpoint
 * rejects with 400 "invalid chat setting" (error 2013).
 * Works recursively so nested object schemas are cleaned too.
 */
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
 * Strips stream_options and parallel_tool_calls which the dome provider rejects (HTTP 400).
 */
async function domeFetch(url, init) {
  if (init?.body) {
    try {
      const body = JSON.parse(init.body);
      delete body.stream_options;
      delete body.parallel_tool_calls;
      // Strip $schema / additionalProperties from tool param schemas (some APIs reject them)
      if (Array.isArray(body.tools)) {
        body.tools = body.tools.map((t) => {
          if (!t?.function?.parameters) return t;
          return {
            ...t,
            function: { ...t.function, parameters: stripZodJsonSchemaMeta(t.function.parameters) },
          };
        });
      }
      // Dome's schema requires content to be a string. LangChain sometimes serializes
      // SystemMessage content as [{type:'text',text:'...'}] — flatten those to a plain string.
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
    } catch (_) { /* leave body as-is if parsing fails */ }
  }
  return fetch(url, init);
}

/**
 * Custom fetch for MiniMax's OpenAI-compatible endpoint.
 * Strips $schema + additionalProperties from every tool parameter schema
 * before the request reaches MiniMax's API.
 */
async function miniMaxFetch(url, init) {
  if (init?.body) {
    try {
      const body = JSON.parse(init.body);
      // Strip $schema + additionalProperties from tool parameter schemas
      if (Array.isArray(body.tools)) {
        body.tools = body.tools.map((t) => {
          if (!t?.function?.parameters) return t;
          return {
            ...t,
            function: { ...t.function, parameters: stripZodJsonSchemaMeta(t.function.parameters) },
          };
        });
      }
      // MiniMax does not support stream_options or parallel_tool_calls
      delete body.stream_options;
      delete body.parallel_tool_calls;
      init = { ...init, body: JSON.stringify(body) };
    } catch (_) { /* leave body as-is if parsing fails */ }
  }
  return fetch(url, init);
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
    // MiniMax M2.x uses the Anthropic-compatible endpoint, not OpenAI.
    // Docs: https://platform.minimax.io/docs/token-plan/quickstart
    const { ChatAnthropic } = await import('@langchain/anthropic');
    const { MINIMAX_BASE_URL } = require('./minimax-config.cjs');
    return new ChatAnthropic({
      model: model || 'MiniMax-M2.7',
      anthropicApiKey: apiKey,
      anthropicApiUrl: `${MINIMAX_BASE_URL}/anthropic`,
      temperature: 0.7,
      maxTokens: 8192,
    });
  }
  if (provider === 'dome') {
    const { ChatOpenAI } = await import('@langchain/openai');
    return new ChatOpenAI({
      model: model || 'dome/auto',
      apiKey: apiKey,
      // streamUsage: false prevents ChatOpenAI from sending stream_options: {include_usage: true}
      // which dome's API rejects with HTTP 400.
      streamUsage: false,
      configuration: { baseURL: baseUrl, fetch: domeFetch },
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

  // Character-based token approximation for models not in the tiktoken registry.
  // Avoids "Unknown model" warnings from @langchain/core's tiktoken path.
  const charTokenCounter = (msgs) =>
    msgs.reduce((sum, m) => {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + Math.ceil(text.length / 4);
    }, 0);

  // OpenAI-family providers have real tiktoken support; others fall back to char count.
  const tokenCounter = ['openai', 'azure', 'google', 'ollama'].includes(provider) ? llm : charTokenCounter;

  return createMiddleware({
    name: 'DomeTrimMessages',
    async wrapModelCall(request, handler) {
      let messages = Array.isArray(request.messages) ? [...request.messages] : [];
      if (messages.length === 0) return handler(request);

      const { SystemMessage } = await import('@langchain/core/messages');

      const isSystemMsg = (m) => {
        try {
          if (m instanceof SystemMessage) return true;
          const t = typeof m._getType === 'function' ? m._getType()
                  : typeof m.getType === 'function' ? m.getType()
                  : m._message_type || m.type || m.role || '';
          return t === 'system';
        } catch { return false; }
      };

      // Helper to extract text from a message content (string or content blocks).
      const getTextContent = (content) => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          return content.map((c) => {
            if (typeof c === 'string') return c;
            if (c && typeof c === 'object' && 'text' in c) return c.text || '';
            return '';
          }).join('\n');
        }
        return JSON.stringify(content);
      };

      if (process.env.DOME_TRIM_DEBUG === '1') {
        console.log('[DomeTrim] types:', messages.map((m, i) => `${i}:${isSystemMsg(m) ? 'SYS' : (typeof m._getType === 'function' ? m._getType() : m.role || '?')}`).join(' '));
      }

      // Lift any system messages out of request.messages and merge them into
      // request.systemMessage/systemPrompt. This is necessary because
      // AgentNode.baseHandler ALWAYS prepends request.systemMessage to
      // request.messages right before the model call — having system messages
      // in both places would produce duplicate system entries, which Anthropic
      // (and MiniMax's Anthropic-compatible endpoint) reject with:
      // "System messages are only permitted as the first passed message."
      const sysIdxs = messages.reduce((acc, m, i) => {
        if (isSystemMsg(m)) acc.push(i);
        return acc;
      }, []);

      let updatedRequest = request;
      if (sysIdxs.length > 0) {
        const sysTexts = sysIdxs.map((i) => getTextContent(messages[i].content));
        const fromSystemMessage = request.systemMessage?.content;
        const fromPromptString =
          typeof request.systemPrompt === 'string' ? request.systemPrompt : '';
        const existingContent = getTextContent(fromSystemMessage ?? fromPromptString ?? '');
        // Dome system prompt first so it sets context, then any middleware additions (VFS, etc.)
        const allSysContent = [...sysTexts, existingContent].filter(Boolean).join('\n\n---\n\n');

        messages = messages.filter((_, i) => !sysIdxs.includes(i));

        console.log(`[AI LangGraph] lifted ${sysIdxs.length} system message(s) → merged systemPrompt (${provider})`);

        // LangChain AgentNode rejects wrapModelCall requests where BOTH systemPrompt and
        // systemMessage appear "changed" vs baseline: `undefined !== baseline.text` counts
        // as a systemPrompt change, so setting only `systemMessage` triggers the error.
        // Update systemPrompt (string) only; leave systemMessage reference unchanged — the
        // node normalizes to a single SystemMessage on the next validation step.
        updatedRequest = {
          ...request,
          messages,
          systemPrompt: allSysContent,
        };
      }

      if (messages.length === 0) return handler(updatedRequest);

      try {
        const trimmed = await trimMessages(messages, {
          maxTokens,
          tokenCounter,
          strategy: 'last',
          includeSystem: false,
          startOn: 'human',
          endOn: ['human', 'tool'],
        });
        if (trimmed.length < messages.length) {
          console.log(`[AI LangGraph] trimmed ${messages.length - trimmed.length} messages → ${trimmed.length} (budget ${maxTokens}, ${provider})`);
        }
        return handler({ ...updatedRequest, messages: trimmed });
      } catch (e) {
        console.warn(`[AI LangGraph] ${provider} trim failed, using full history:`, e?.message);
        return handler(updatedRequest);
      }
    },
  });
}

/**
 * Optional LangChain summarization middleware (context engineering).
 * Disable with DOME_LANGGRAPH_SUMMARIZATION=0 if it causes issues with a provider.
 * @param {string} provider
 * @param {import('@langchain/core').BaseChatModel} llm
 * @returns {Promise<import('langchain').AgentMiddleware | null>}
 */
async function createSummarizationMiddlewareMaybe(provider, llm) {
  const off = String(process.env.DOME_LANGGRAPH_SUMMARIZATION ?? '').toLowerCase().trim();
  if (off === '0' || off === 'false' || off === 'off' || off === 'no') return null;
  try {
    const { summarizationMiddleware } = await import('langchain');
    const maxTokens = PROVIDER_TOKEN_BUDGETS[provider] ?? DEFAULT_TOKEN_BUDGET;
    return summarizationMiddleware({
      model: llm,
      trigger: { tokens: Math.floor(maxTokens * 0.7), messages: 8 },
      keep: { messages: 10 },
    });
  } catch (e) {
    console.warn('[AI LangGraph] summarizationMiddleware not loaded:', e?.message || e);
    return null;
  }
}

const CALENDAR_HITL_TOOLS = {
  calendar_create_event: true,
  calendar_update_event: true,
  calendar_delete_event: true,
  calendar_create: true,
  calendar_update: true,
  calendar_delete: true,
};

function buildHitlInterruptOn(skipHitl, useDirectTools) {
  if (skipHitl) {
    return {
      call_writer_agent: false,
      call_data_agent: false,
      calendar_create_event: false,
      calendar_update_event: false,
      calendar_delete_event: false,
      calendar_create: false,
      calendar_update: false,
      calendar_delete: false,
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
    runtimeContext: runtimeContextRaw,
    store,
  } = opts;

  const runtimeContext = parseRuntimeContext(runtimeContextRaw);

  const toolContext = (automationProjectId || runtimeContext)
    ? {
        ...(automationProjectId ? { automationProjectId } : {}),
        ...(runtimeContext ? { runtimeContext } : {}),
      }
    : null;

  const rtEmittedCallIds = new Set();
  const rtEmittedResultIds = new Set();
  let rtCallCounter = 0;
  const callCounter = makeToolCallCounter();

  let tools;
  if (useDirectTools) {
    const executeFn = async (name, args, invocationConfig) => {
      const fromAgent = invocationConfig?.toolCall?.id;
      const id =
        fromAgent != null && String(fromAgent).length > 0
          ? String(fromAgent)
          : `rt_${threadId || 'x'}_${++rtCallCounter}`;
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
      const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
      const resultStr = capToolResultString(name, resultStr0);
      if (onChunk) onChunk({ type: 'tool_result', toolCallId: id, result: resultStr });
      rtEmittedResultIds.add(id);
      return resultStr;
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
    const asyncSubagentTools = await createAsyncSubagentTools({
      threadId,
      llm,
      createLangChainTools: createLangChainToolsFromOpenAIDefinitions,
      onChunk,
      toolContext,
      subagentIds,
    });
    const mcpTools = Array.isArray(mcpServerIds)
      ? (mcpServerIds.length > 0 ? await getMCPTools(database, mcpServerIds) : [])
      : await getMCPTools(database);
    const mainAgentDefs = [
      {
        type: 'function',
        function: {
          name: 'dome_load_doc',
          description:
            DOME_LOAD_DOC_DESCRIPTION,
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                enum: ['entity_rules', 'artifacts', 'artifact_persisted', 'artifact_design', 'resource_links'],
                description: 'Section identifier',
              },
            },
            required: ['id'],
          },
        },
      },
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
      const result = await executeToolInMain(name, args, toolContext);
      const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
      return capToolResultString(name, resultStr0);
    });
    tools = [...subagentTools, ...asyncSubagentTools, ...mcpTools, ...mainAgentTools];
  }

  if (Array.isArray(customTools) && customTools.length > 0) {
    tools = [...tools, ...customTools];
  }

  // Always inject dome_load_doc (meta-tool) — handles both branches.
  const alreadyHasDomeLoadDoc = tools.some((t) => (t.name || t.function?.name) === 'dome_load_doc');
  if (!alreadyHasDomeLoadDoc) {
    const domeLoadDocDef = [
      {
        type: 'function',
        function: {
          name: 'dome_load_doc',
          description:
            DOME_LOAD_DOC_DESCRIPTION,
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                enum: ['entity_rules', 'artifacts', 'artifact_persisted', 'artifact_design', 'resource_links'],
                description: 'Section identifier',
              },
            },
            required: ['id'],
          },
        },
      },
    ];
    const domeLoadDocTools = await createLangChainToolsFromOpenAIDefinitions(domeLoadDocDef, async (name, args) => {
      const capError = callCounter.check(name);
      if (capError) return { error: capError };
      const result = await executeToolInMain(name, args, toolContext);
      const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
      return capToolResultString(name, resultStr0);
    });
    tools = [...domeLoadDocTools, ...tools];
  }

  // Inject runtime-context tools when the session has an active or pinned resource.
  if (runtimeContext?.activeResourceId || runtimeContext?.pinnedResourceIds?.length > 0) {
    const rtDefs = [];
    if (runtimeContext.activeResourceId) {
      rtDefs.push({
        type: 'function',
        function: {
          name: 'resource_get_active',
          description: 'Get the full content of the resource currently open in the viewer. Use when the user asks to read, summarize, analyze, or reference the active document.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      });
    }
    if (runtimeContext.pinnedResourceIds?.length > 0) {
      rtDefs.push({
        type: 'function',
        function: {
          name: 'resource_get_pinned',
          description: 'Get the content of a resource pinned to context by the user. Only use IDs listed in the system prompt Pinned Context Resources section.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The resource ID from the Pinned Context Resources list.' },
            },
            required: ['id'],
          },
        },
      });
    }
    if (rtDefs.length > 0) {
      const rtTools = await createLangChainToolsFromOpenAIDefinitions(rtDefs, async (name, args) => {
        const capError = callCounter.check(name);
        if (capError) return { error: capError };
        const result = await executeToolInMain(name, args, toolContext);
        const resultStr0 = typeof result === 'string' ? result : JSON.stringify(result);
        return capToolResultString(name, resultStr0);
      });
      tools = [...tools, ...rtTools];
    }
  }

  const interruptOn = buildHitlInterruptOn(skipHitl, useDirectTools);
  const hitlMiddleware = humanInTheLoopMiddleware({
    interruptOn,
    descriptionPrefix: 'Acción pendiente de aprobación',
  });
  const trimMiddleware = await createTrimmingMiddleware(provider, llm);
  const summarizationMw = await createSummarizationMiddlewareMaybe(provider, llm);

  const skillsMw = await buildSkillsMiddleware();
  const guardrailsMw = buildGuardrailsMiddleware();

  // DomeTrimMessages must be the innermost wrapModelCall wrapper so it sees ALL
  // injected messages before ChatAnthropic validates.
  // Order (outermost→innermost): guardrails → summarization → HITL → skills → trim → model
  const middleware = (() => {
    const base = [
      ...(guardrailsMw ? [guardrailsMw] : []),
      ...(summarizationMw ? [summarizationMw] : []),
    ];
    const skillsStack = skillsMw ? [skillsMw] : [];
    if (skipHitl) {
      return [...base, ...skillsStack, trimMiddleware];
    }
    return [...base, hitlMiddleware, ...skillsStack, trimMiddleware];
  })();

  const agent = createAgent({
    model: llm,
    tools,
    middleware,
    checkpointer: getSharedCheckpointer(),
    store: store ?? getDomeStore(),
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
    threadId: threadIdArg,
    skipHitl,
    automationProjectId,
  } = opts;

  const effectiveThreadId = threadIdArg || `dome_${Date.now()}`;
  let hitInterrupt = false;

  const llm = await createModelFromConfig(provider, model, apiKey, baseUrl);

  const useDirectTools = opts.useDirectTools === true;
  const mcpServerIds = opts.mcpServerIds;
  const subagentIds = Array.isArray(opts.subagentIds) ? opts.subagentIds : undefined;

  let domeMessages = Array.isArray(messages) ? [...messages] : [];
  try {
    const agentsMd = projectMemory.loadProjectAgentsMarkdown(null);
    if (agentsMd) {
      domeMessages = projectMemory.injectProjectMemoryIntoMessages(domeMessages, agentsMd);
    }
  } catch (e) {
    console.warn('[AI LangGraph] project memory (AGENTS.md) skipped:', e?.message || e);
  }

  const { agent, rtEmittedCallIds, rtEmittedResultIds } = await createConfiguredLangGraphAgent(llm, {
    useDirectTools,
    toolDefinitions: opts.toolDefinitions,
    mcpServerIds,
    subagentIds,
    skipHitl,
    onChunk,
    threadId: effectiveThreadId,
    automationProjectId,
    provider,
    customTools: opts.customTools,
    runtimeContext: opts.runtimeContext,
  });

  // Trimming is handled inside the graph by `DomeTrimMessages` middleware so
    // that intermediate tool turns also stay within the provider budget.
    const lcMessages = await toLangChainMessages(domeMessages);

    // Emit token budget breakdown for telemetry (first message of the run only).
    if (onChunk) {
      const sysMsg = Array.isArray(domeMessages) ? domeMessages.find((m) => m.role === 'system') : null;
      const histMsgs = Array.isArray(domeMessages) ? domeMessages.filter((m) => m.role !== 'system') : [];
      const budgetBreakdown = measurePrompt({
        system: sysMsg?.content || '',
        tools: opts.toolDefinitions || [],
        history: histMsgs,
      });
      onChunk({ type: 'budget', breakdown: budgetBreakdown });
    }

    const config = withLangfuseCallbacks({
      configurable: { thread_id: effectiveThreadId },
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
        hitInterrupt = true;
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
 * Run agent without streaming (for batch / non-UI consumers).
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
  let hitInterrupt = false;

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
    runtimeContext: rest.runtimeContext,
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
        hitInterrupt = true;
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
  createModelFromConfig,
  createConfiguredLangGraphAgent,
};
