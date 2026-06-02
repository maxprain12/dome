/* eslint-disable no-console */
/**
 * LangGraph Agent - Main Process
 *
 * Runs the chat with tools using deepagents/createDeepAgent.
 * Converts Dome's OpenAI-format tool definitions to LangChain tools,
 * creates a model from provider config, and streams results.
 *
 * Context engineering: LangChain middleware stack via electron/agent-middleware.cjs
 * (summarization, retry, limits, PII, todo list, tool selector, filesystem, trim).
 * Disable pieces with DOME_LANGGRAPH_* env vars — see docs/architecture/middleware.md.
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
const { createAsyncSubagentTools } = require('./async-subagents.cjs');
const { buildDeepAgentSubagentSpecs } = require('./subagent-specs.cjs');
const { createModelFromConfig } = require('./model-factory.cjs');
const { registerDomeHarnessProfiles } = require('./harness-profiles.cjs');
const {
  createDomeHarnessBackendFactory,
  DEFAULT_HARNESS_PERMISSIONS,
} = require('./harness-backend.cjs');
const { userSkillsDir } = require('./skills/index.cjs');
const { getMCPTools } = require('./mcp-client.cjs');
const database = require('./database.cjs');
const { getDomeCheckpointer } = require('./checkpointer.cjs');
const { getDomeStore } = require('./agent-store.cjs');
const { withLangfuseCallbacks } = require('./observability.cjs');
const { measurePrompt } = require('./prompt-budget.cjs');
const { parseRuntimeContext } = require('./agent-runtime-context.cjs');
const projectMemory = require('./project-memory.cjs');
const { buildSkillsMiddleware } = require('./skills/index.cjs');
const { buildAgentMiddlewareStack, buildMiddlewareLimitReachedMessage } = require('./agent-middleware.cjs');
const { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS } = require('./prompt-sections.cjs');
const { capToolResultString } = require('./tool-result-cap.cjs');
const { summarizeToolResultForUi, formatToolResultForModel } = require('./tool-result-format.cjs');
const {
  normalizeToolInput,
  getMissingRequiredFields,
  formatToolValidationError,
} = require('./tool-input-normalize.cjs');
const { capLangChainTools, sanitizeLeakedToolManifestText } = require('./tool-cap.cjs');

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
 * Recursion limit for `createDeepAgent`. LangGraph default is 25; raised to 1500 for
 * Excel/sheet-style flows and multi-step agentic workflows (feeders,
 * artifact + Redfish loops, deep research) that legitimately need many
 * model+tool turns. Override with DOME_RECURSION_LIMIT env var. If you ever see
 * `GraphRecursionError` outside of a runaway loop, bump this — but first confirm
 * the agent isn't oscillating.
 */
const RECURSION_LIMIT = Number(process.env.DOME_RECURSION_LIMIT) || 1500;

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
 * Stateful parser for `<think>...</think>` blocks streamed across chunks
 * (MiniMax M2.5, DeepSeek-style models). Tokens may split tags mid-bracket,
 * so we buffer suspicious partial tags and only emit complete segments.
 */
function createThinkingStreamParser(onChunk) {
  let buffer = '';
  let mode = 'text'; // 'text' | 'inThink'

  function emit(type, text) {
    const safe =
      type === 'text' && typeof text === 'string' ? sanitizeLeakedToolManifestText(text) : text;
    if (safe && onChunk) onChunk({ type, text: safe });
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
 * A model/tool call-limit middleware emits a state update on EVERY step in
 * normal operation (incrementing its call counters and resetting run counts in
 * `afterAgent`), without any `messages`. It only injects its user-facing limit
 * notice — an artificial AIMessage/ToolMessage — when a limit is actually
 * exceeded. Detecting the node name alone is therefore a false positive that
 * overwrites a successful reply with the "limit reached" message. Require the
 * limit notice content in the node delta instead.
 *
 * @param {*} delta - the state update emitted by a single graph node
 * @returns {boolean}
 */
function deltaSignalsCallLimit(delta) {
  const messages = delta?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.some((m) => {
    const content = typeof m?.content === 'string' ? m.content : '';
    return /call limit (?:exceeded|reached)/i.test(content);
  });
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
  let hitModelCallLimit = false;
  let hitToolCallLimit = false;

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
      if (msgChunk._getType() === 'ai') {
        const partialUsage = extractUsageFromAiMessage(msgChunk);
        if (partialUsage && onChunk) {
          onChunk({ type: 'usage', usage: partialUsage, partial: true });
        }
      }
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
        if (deltaSignalsCallLimit(delta)) {
          if (nodeName.includes('ModelCallLimitMiddleware')) hitModelCallLimit = true;
          if (nodeName.includes('ToolCallLimitMiddleware')) hitToolCallLimit = true;
        }
        const messages = delta?.messages;
        if (!Array.isArray(messages)) continue;
        for (const msg of messages) {
          if (!msg || typeof msg._getType !== 'function') continue;
          const t = msg._getType();
          const subAgentName = agentNameFromNamespace(streamNamespace);
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
                  ...(subAgentName ? { agentName: subAgentName } : {}),
                });
              }
            }
          } else if ((t === 'tool' || t === 'ToolMessage') && msg.tool_call_id != null) {
            const id = msg.tool_call_id;
            if (seenToolResultIds.has(id) || rtEmittedResultIds?.has(id)) continue;
            seenToolResultIds.add(id);
            const toolName = typeof msg.name === 'string' ? msg.name : 'tool';
            let resultContent = msg.content;
            if (Array.isArray(resultContent)) {
              const imageCount = resultContent.filter(
                (b) => b && (b.type === 'image_url' || b.type === 'image'),
              ).length;
              resultContent = JSON.stringify({
                delivery: 'vision_blocks',
                block_count: resultContent.length,
                image_count: imageCount,
                note: 'Images attached for model vision QA.',
              });
            } else if (typeof resultContent !== 'string') {
              try { resultContent = JSON.stringify(resultContent); } catch { resultContent = String(resultContent); }
              resultContent = capToolResultString(toolName, resultContent);
            } else {
              resultContent = capToolResultString(toolName, resultContent);
            }
            if (onChunk) {
              onChunk({
                type: 'tool_result',
                toolCallId: id,
                result: resultContent,
                ...(subAgentName ? { agentName: subAgentName } : {}),
              });
            }
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
  return { capturedInterrupt, hitModelCallLimit, hitToolCallLimit };
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
  let lastAI = null;
  try {
    const state = await agent.getState(config);
    finalMessages = state?.values?.messages || state?.messages || [];
    lastAI = [...finalMessages].reverse().find(
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
  return { finalText, finalMessages, lastAI };
}

/**
 * Emit aggregated usage from checkpointed messages (e.g. before HITL return).
 */
async function emitUsageFromCheckpoint(agent, config, onChunk, partial = true) {
  try {
    const state = await agent.getState(config);
    const msgs = state?.values?.messages || state?.messages || [];
    const usage = aggregateUsageFromMessages(msgs);
    if (usage && onChunk) onChunk({ type: 'usage', usage, partial });
  } catch {
    /* ignore */
  }
}

/**
 * Shared post-stream finalization for invoke and resume.
 */
async function completeAgentRunAfterStream({
  agent,
  config,
  onChunk,
  capturedInterrupt,
  provider,
  model,
  hitModelCallLimit = false,
  hitToolCallLimit = false,
}) {
  const interrupt = await extractInterrupt(capturedInterrupt, agent, config);
  if (interrupt) {
    await emitUsageFromCheckpoint(agent, config, onChunk, true);
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

  const { finalText, finalMessages, lastAI } = await finalizeFromState(agent, config);

  let effectiveText = finalText;
  const limitMessage = buildMiddlewareLimitReachedMessage({ hitModelCallLimit, hitToolCallLimit });
  const middlewareErr = limitMessage || detectMiddlewareErrorMessage(lastAI);
  if (middlewareErr) {
    console.warn('[AI LangGraph] middleware error in final AIMessage:', finalText.slice(0, 300));
    if (onChunk) onChunk({ type: 'text', text: middlewareErr });
    effectiveText = middlewareErr;
  } else if (!effectiveText || !effectiveText.trim()) {
    const fallback = buildEmptyResponseFallback(lastAI);
    console.warn('[AI LangGraph] empty model response — emitting fallback', {
      provider,
      model,
      stop_reason:
        lastAI?.response_metadata?.stop_reason ||
        lastAI?.response_metadata?.finish_reason ||
        null,
      has_tool_calls: Array.isArray(lastAI?.tool_calls) && lastAI.tool_calls.length > 0,
    });
    if (onChunk) onChunk({ type: 'text', text: fallback });
    effectiveText = fallback;
  }

  const aggregatedUsage = aggregateUsageFromMessages(finalMessages);
  if (aggregatedUsage && onChunk) {
    onChunk({ type: 'usage', usage: aggregatedUsage, partial: false });
  }
  if (onChunk) onChunk({ type: 'done' });

  return effectiveText;
}

/**
 * Build a user-visible fallback message when the model returns an empty AIMessage.
 *
 * Common causes: provider-side content policy refusals (Anthropic / MiniMax-via-Anthropic
 * return empty content blocks instead of raising), max_tokens hit before any text, or a
 * tool_calls-only message that the agent loop didn't follow up on.
 *
 * @param {*} lastAI - the last AIMessage from state
 * @returns {string} fallback markdown to surface in the chat
 */
function buildEmptyResponseFallback(lastAI) {
  const meta = lastAI?.response_metadata || lastAI?.lc_kwargs?.response_metadata || {};
  const stop =
    meta.stop_reason ||
    meta.stopReason ||
    meta.finish_reason ||
    meta.finishReason ||
    null;
  const hasToolCalls = Array.isArray(lastAI?.tool_calls) && lastAI.tool_calls.length > 0;

  if (hasToolCalls) {
    return 'El modelo intentó usar herramientas pero no devolvió texto. Reintenta o reformula la petición.';
  }
  if (stop === 'refusal' || stop === 'content_filter' || stop === 'safety') {
    return (
      'El proveedor del modelo rechazó la petición por su política de uso. ' +
      'Reformula evitando credenciales reales, exploits o accesos a infraestructura sin permiso.'
    );
  }
  if (stop === 'max_tokens' || stop === 'length') {
    return 'El modelo cortó la respuesta por alcanzar el límite de tokens antes de producir texto. Reintenta o reduce el contexto.';
  }
  return (
    'El modelo devolvió una respuesta vacía. ' +
    'Esto suele ocurrir cuando el proveedor rechaza el prompt sin avisar, ' +
    'o cuando una herramienta se invocó sin texto adjunto. Reintenta con otra redacción.'
  );
}

/**
 * Detect the AIMessage shape that `modelRetryMiddleware({ onFailure: 'continue' })`
 * produces when all retries fail. The middleware returns the AIMessage directly
 * (without streaming chunks), so `mode=messages` emits nothing and the chat shows
 * an empty bubble. We surface a friendly version of the error here.
 *
 * Pattern: content starts with "Model call failed" and `name === 'model'`.
 *
 * @param {*} lastAI
 * @returns {string | null}
 */
function detectMiddlewareErrorMessage(lastAI) {
  if (!lastAI) return null;
  const content = typeof lastAI.content === 'string' ? lastAI.content : '';
  if (!content) return null;
  const looksLikeFailure =
    content.startsWith('Model call failed') ||
    content.includes('MiddlewareError') ||
    (lastAI.name === 'model' && content.includes('failed after'));
  if (!looksLikeFailure) return null;
  const m = content.match(/MiddlewareError:\s*(.+?)(?:\s*Available tools:|$)/s);
  const inner = (m && m[1] ? m[1] : content).trim();
  const lower = inner.toLowerCase();

  if (
    lower.includes('output_parsing_failure') ||
    lower.includes('failed to parse') ||
    (lower.includes('syntaxerror') && lower.includes('json'))
  ) {
    return (
      'El selector automático de herramientas no pudo interpretar la respuesta del modelo (JSON duplicado o inválido).\n\n' +
      '> ' + inner.split('\n').join('\n> ') + '\n\n' +
      'Reintenta el mensaje. Si persiste, desactiva el selector con `DOME_LANGGRAPH_TOOL_SELECTOR=0` en `.env` y reinicia Dome.'
    );
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('socket hang up') ||
    lower.includes('network error') ||
    lower.includes('timeout')
  ) {
    return (
      'No se pudo contactar al proveedor de LLM (fallo de red transitorio):\n\n' +
      '> ' + inner.split('\n').join('\n> ') + '\n\n' +
      'Revisa tu conexión y vuelve a enviar el mensaje. Si persiste, comprueba la consola del proceso main ' +
      'y el estado del proveedor (OpenAI / Anthropic / Ollama / Dome Provider).'
    );
  }

  return (
    'Se produjo un fallo interno en el middleware del agente:\n\n' +
    '> ' + inner.split('\n').join('\n> ') + '\n\n' +
    'Reintenta la petición. Si vuelve a ocurrir, revisa la consola del proceso main.'
  );
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
 * Wrap executeToolInMain with vision-aware formatting and UI-safe summaries.
 * @param {{ toolContext?: object, provider?: string, model?: string, onChunk?: Function, rtEmittedCallIds?: Set<string>, rtEmittedResultIds?: Set<string>, threadId?: string }} ctx
 */
function createToolExecuteFn(ctx) {
  const {
    toolContext = null,
    provider = 'openai',
    model = '',
    onChunk,
    rtEmittedCallIds,
    rtEmittedResultIds,
    threadId,
  } = ctx;
  let rtCallCounter = 0;

  return async (name, args, invocationConfig) => {
    const fromAgent = invocationConfig?.toolCall?.id;
    const id =
      fromAgent != null && String(fromAgent).length > 0
        ? String(fromAgent)
        : `rt_${threadId || 'x'}_${++rtCallCounter}`;

    if (rtEmittedCallIds) rtEmittedCallIds.add(id);
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

    const raw = await executeToolInMain(name, args, toolContext);
    const formatted = formatToolResultForModel(name, raw, { provider, modelId: model });
    const uiText = summarizeToolResultForUi(name, raw);
    if (onChunk) onChunk({ type: 'tool_result', toolCallId: id, result: uiText });
    if (rtEmittedResultIds) rtEmittedResultIds.add(id);
    return formatted;
  };
}

/** Simple execute fn without streaming telemetry (subagent defs, dome_load_doc injectors). */
function createPlainToolExecuteFn(toolContext, provider, model) {
  return async (name, args) => {
    const raw = await executeToolInMain(name, args, toolContext);
    return formatToolResultForModel(name, raw, { provider, modelId: model });
  };
}

/**
 * Create LangChain tools from OpenAI-format definitions.
 * Uses dynamic import for ESM @langchain/core (tool, tool schema).
 *
 * Zod schema is intentionally lenient (all fields optional + passthrough) so invalid
 * model kwargs return a ToolMessage error instead of aborting the LangGraph run.
 * Required fields are validated in-process and surfaced back to the model for retry.
 */
async function createLangChainToolsFromOpenAIDefinitions(defs, executeFn, toolContext = null) {
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
        zodShape[key] = field.optional();
      }
    }

    const schema =
      Object.keys(zodShape).length > 0 ? z.object(zodShape).passthrough() : z.object({}).passthrough();
    const lcTool = tool(
      async (input, config) => {
        const normalized = normalizeToolInput(normName, input || {}, toolContext);
        const missing = getMissingRequiredFields(params, normalized);
        if (missing.length > 0) {
          return JSON.stringify({
            success: false,
            error: formatToolValidationError(normName, missing),
          });
        }
        const result = await executeFn(normName, normalized, config);
        if (Array.isArray(result)) return result;
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      { name: normName, description: description || '', schema },
    );
    tools.push(lcTool);
  }
  return tools;
}

const SUBAGENT_NAMESPACE_NAMES = new Set(['research', 'library', 'writer', 'data']);

/** Resolve subagent display name from LangGraph stream namespace. */
function agentNameFromNamespace(namespace) {
  if (!Array.isArray(namespace) || namespace.length === 0) return null;
  const seg = String(namespace[0] || '');
  const m = seg.match(/^tools:([^:]+)/) || seg.match(/^(.+?):/);
  if (m && m[1] && SUBAGENT_NAMESPACE_NAMES.has(m[1])) return m[1];
  return null;
}

/**
 * Convert Dome messages to LangChain format.
 * Uses dynamic import for ESM.
 * @param {Array<{ role: string, content?: string | unknown[], attachments?: { images?: unknown[], videos?: unknown[] } }>} messages
 * @param {{ provider?: string, modelId?: string }} [opts]
 */
async function toLangChainMessages(messages, opts = {}) {
  const { normalizeUserMessage } = require('./message-multimodal.cjs');
  const { HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');
  const provider = opts.provider || 'openai';
  const modelId = opts.modelId || '';
  const result = [];
  for (const m of messages) {
    if (m.role === 'system') {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      result.push(new SystemMessage(content));
    } else if (m.role === 'user') {
      const content = normalizeUserMessage(m.content, {
        provider,
        modelId,
        attachments: m.attachments,
      });
      result.push(new HumanMessage({ content }));
    } else if (m.role === 'assistant') {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      result.push(new AIMessage(content));
    } else {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      result.push(new HumanMessage(content));
    }
  }
  return result;
}

const CALENDAR_HITL_TOOLS = {
  calendar_create_event: true,
  calendar_update_event: true,
  calendar_delete_event: true,
  calendar_create: true,
  calendar_update: true,
  calendar_delete: true,
};

function buildHitlInterruptOn(skipHitl) {
  if (skipHitl) {
    return {
      task: false,
      calendar_create_event: false,
      calendar_update_event: false,
      calendar_delete_event: false,
      calendar_create: false,
      calendar_update: false,
      calendar_delete: false,
    };
  }
  return {
    task: false,
    ...CALENDAR_HITL_TOOLS,
  };
}

/**
 * Shared agent graph for invoke + resume (must match checkpoint thread).
 * @param {import('@langchain/core').BaseChatModel} llm
 */
async function createConfiguredLangGraphAgent(llm, opts) {
  registerDomeHarnessProfiles();
  const { createDeepAgent } = await import('deepagents');
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
    systemPrompt: systemPromptArg = '',
  } = opts;

  const agentStore = store ?? getDomeStore();
  const runtimeContext = parseRuntimeContext(runtimeContextRaw);

  const toolContext =
    automationProjectId || runtimeContext || opts.senderWebContentsId != null
      ? {
          ...(automationProjectId ? { automationProjectId } : {}),
          ...(runtimeContext ? { runtimeContext } : {}),
          ...(opts.senderWebContentsId != null ? { senderWebContentsId: opts.senderWebContentsId } : {}),
        }
      : null;

  const rtEmittedCallIds = new Set();
  const rtEmittedResultIds = new Set();

  let tools;
  if (useDirectTools) {
    const executeFn = createToolExecuteFn({
      toolContext,
      provider,
      model: opts.model,
      onChunk,
      rtEmittedCallIds,
      rtEmittedResultIds,
      threadId,
    });
    const directTools = toolDefinitions?.length
      ? await createLangChainToolsFromOpenAIDefinitions(toolDefinitions, executeFn, toolContext)
      : [];
    const mcpTools = await getMCPTools(database, mcpServerIds);
    tools = [...directTools, ...mcpTools];
  } else {
    const asyncSubagentTools = await createAsyncSubagentTools({
      threadId,
      llm,
      createLangChainTools: createLangChainToolsFromOpenAIDefinitions,
      onChunk,
      toolContext,
      subagentIds,
      provider,
      store: agentStore,
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
                enum: DOME_LOAD_DOC_IDS,
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
    const mainAgentTools = await createLangChainToolsFromOpenAIDefinitions(
      mainAgentDefs,
      createPlainToolExecuteFn(toolContext, provider, opts.model),
      toolContext,
    );
    tools = [...asyncSubagentTools, ...mcpTools, ...mainAgentTools];
  }

  // Build deepagents subagent specs (exposed to the model via the native `task` tool).
  // Normally only in the non-direct-tools harness, but also when a direct-tools caller
  // (e.g. Many) explicitly requests subagents via a non-empty subagentIds list.
  let deepSubagents = [];
  const wantsSubagents = Array.isArray(subagentIds) && subagentIds.length > 0;
  if (!useDirectTools || wantsSubagents) {
    deepSubagents = await buildDeepAgentSubagentSpecs({
      llm,
      createLangChainTools: createLangChainToolsFromOpenAIDefinitions,
      toolContext,
      agentNames: subagentIds,
      runtime: { provider, store: agentStore },
    });
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
                enum: DOME_LOAD_DOC_IDS,
                description: 'Section identifier',
              },
            },
            required: ['id'],
          },
        },
      },
    ];
    const domeLoadDocTools = await createLangChainToolsFromOpenAIDefinitions(
      domeLoadDocDef,
      createPlainToolExecuteFn(toolContext, provider, opts.model),
      toolContext,
    );
    tools = [...domeLoadDocTools, ...tools];
  }

  // Inject runtime-context tools when the session has an active or pinned resource (not in bench harness).
  if (
    process.env.DOME_BENCH !== '1' &&
    (runtimeContext?.activeResourceId || runtimeContext?.pinnedResourceIds?.length > 0)
  ) {
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
      const rtTools = await createLangChainToolsFromOpenAIDefinitions(
        rtDefs,
        createPlainToolExecuteFn(toolContext, provider, opts.model),
        toolContext,
      );
      tools = [...tools, ...rtTools];
    }
  }

  tools = capLangChainTools(tools, { provider, model: opts.model });

  const interruptOn = buildHitlInterruptOn(skipHitl);

  const isBench = process.env.DOME_BENCH === '1';
  const middleware = await buildAgentMiddlewareStack({
    profile: isBench ? 'bench' : 'full',
    provider,
    llm,
    tools,
    skipHitl,
    hitlMiddleware: null,
    skillsMiddleware: null,
    store: agentStore,
    harnessStack: 'deep',
  });

  const backendFactory = createDomeHarnessBackendFactory(agentStore);

  const agent = await createDeepAgent({
    model: llm,
    tools,
    systemPrompt: typeof systemPromptArg === 'string' ? systemPromptArg : '',
    middleware,
    subagents: deepSubagents,
    interruptOn,
    checkpointer: getSharedCheckpointer(),
    store: agentStore,
    backend: backendFactory,
    permissions: DEFAULT_HARNESS_PERMISSIONS,
    ...(!isBench ? { skills: [userSkillsDir()] } : {}),
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

  const sysMsg = domeMessages.find((m) => m.role === 'system');
  const systemPrompt =
    typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const nonSystemMessages = domeMessages.filter((m) => m.role !== 'system');

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
    model,
    customTools: opts.customTools,
    runtimeContext: opts.runtimeContext,
    systemPrompt,
  });

  const lcMessages = await toLangChainMessages(nonSystemMessages, { provider, model });

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
      const { capturedInterrupt, hitModelCallLimit, hitToolCallLimit } = await streamAgentRun(
        agent,
        { messages: lcMessages },
        config,
        onChunk,
        rtEmittedCallIds,
        rtEmittedResultIds,
      );

      return await completeAgentRunAfterStream({
        agent,
        config,
        onChunk,
        capturedInterrupt,
        provider,
        model,
        hitModelCallLimit,
        hitToolCallLimit,
      });
    } catch (err) {
      const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
      if (onChunk) {
        if (isAbort) {
          await emitUsageFromCheckpoint(agent, config, onChunk, true);
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
    model,
    customTools: customToolsArg,
    runtimeContext: rest.runtimeContext,
  });

  const config = withLangfuseCallbacks({
      configurable: { thread_id: threadId },
      recursionLimit: RECURSION_LIMIT,
      signal,
    });

    try {
      const { capturedInterrupt, hitModelCallLimit, hitToolCallLimit } = await streamAgentRun(
        agent,
        new Command({ resume: { decisions } }),
        config,
        onChunk,
        rtEmittedCallIds,
        rtEmittedResultIds,
      );

      return await completeAgentRunAfterStream({
        agent,
        config,
        onChunk,
        capturedInterrupt,
        provider,
        model,
        hitModelCallLimit,
        hitToolCallLimit,
      });
    } catch (err) {
      const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
      if (onChunk) {
        if (isAbort) {
          await emitUsageFromCheckpoint(agent, config, onChunk, true);
          onChunk({ type: 'done' });
        } else {
          onChunk({ type: 'error', error: err?.message || String(err) });
        }
      }
      throw err;
    }
}

module.exports = {
  invokeLangGraphAgent,
  resumeLangGraphAgent,
  runLangGraphAgentSync,
  streamAgentRun,
  peelLangGraphStreamTuple,
  createLangChainToolsFromOpenAIDefinitions,
  aggregateUsageFromMessages,
  createModelFromConfig,
  createConfiguredLangGraphAgent,
};
