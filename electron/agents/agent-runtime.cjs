'use strict';

/* eslint-disable no-console */
/**
 * Dome agent runtime.
 *
 * Drives `@dome/agent-core` (the Dome-native agent loop, vendored from a robust
 * upstream agent runtime) for every agent surface ("many", "agent-chat",
 * "workflows", "agent-team", "bench"). The loop is: stream → tools → repeat,
 * with argument validation, before/after tool hooks, sequential/parallel tool
 * execution and summarization-based compaction.
 *
 * The legacy LangGraph/LangChain agent stack has been removed; this
 * module is the single entry point for running an agent turn. The heavy
 * `@dome/agent-core` import is lazy so requiring this module never pulls the
 * ESM runtime into the CommonJS main process at load time.
 */

const DEFAULT_RECURSION_LIMIT = 25;

/** Per-conversation caps for creation/mutation tools (count over history). */
const CREATION_TOOL_CAPS = Object.freeze({
  resource_create: 20,
  resource_update: 30,
  resource_delete: 20,
  artifact_create: 15,
  artifact_update_state: 50,
  artifact_merge_data: 40,
  artifact_delete: 15,
  ppt_create: 8,
  flashcard_create: 8,
  generate_quiz: 5,
  generate_mindmap: 5,
  generate_guide: 5,
  generate_faq: 5,
  generate_timeline: 5,
  generate_table: 5,
  generate_audio_overview: 5,
  generate_video_overview: 5,
  notebook_add_cell: 50,
  pdf_annotation_create: 50,
  link_resources: 40,
});

/** Heuristics for obviously harmful patterns (NOT a security boundary). */
const HARMFUL_PATTERNS = [
  /\b(make|create|build|write|generate)\b.{0,40}\b(malware|ransomware|keylogger|trojan|rootkit|spyware|exploit kit)\b/i,
  /\b(step[- ]by[- ]step|instructions?|guide|how to)\b.{0,60}\b(synthesize|produce|manufacture)\b.{0,40}\b(fentanyl|sarin|vx gas|nerve agent|bioweapon|chemical weapon)\b/i,
  /\bgenerate\b.{0,30}\b(csam|child porn|child sexual)\b/i,
];

function recursionLimit() {
  const n = Number(process.env.DOME_RECURSION_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RECURSION_LIMIT;
}

/** Map a pi `Usage` to the legacy renderer usage-chunk shape. */
function piUsageToLegacyChunk(usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    totalTokens: usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0),
  };
}

/**
 * Resolve which runtime a surface uses. Only the Dome-native runtime
 * (`@dome/agent-core`) exists; kept as a function for call sites and tests.
 */
function resolveRuntime() {
  return 'domeagent';
}

/** Join the text blocks of an assistant message's content array. */
function assistantText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

/** Extract renderable text from a pi `AgentToolResult`. */
function toolResultText(result) {
  if (!result) return '';
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    if (text) return text;
  }
  if (result.details == null) return '';
  if (typeof result.details === 'string') return result.details;
  try {
    return JSON.stringify(result.details);
  } catch {
    return String(result.details);
  }
}

/** Map the granular streaming event carried by `message_update`. */
function mapAssistantEventToChunk(ev) {
  if (!ev || typeof ev.type !== 'string') return null;
  switch (ev.type) {
    case 'text_delta':
      return { type: 'text', text: ev.delta };
    case 'thinking_delta':
      return { type: 'thinking', text: ev.delta };
    default:
      return null;
  }
}

/**
 * Map an `@dome/agent-core` `AgentEvent` to the legacy `onChunk` chunk shape
 * the renderer already consumes. Returns `null` for events with no equivalent.
 */
function mapAgentEventToChunk(event) {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'message_update':
      return mapAssistantEventToChunk(event.assistantMessageEvent);
    case 'tool_execution_start':
      return {
        type: 'tool_call',
        toolCall: {
          id: event.toolCallId,
          name: event.toolName,
          arguments:
            typeof event.args === 'string' ? event.args : JSON.stringify(event.args || {}),
        },
      };
    case 'tool_execution_end':
      return {
        type: 'tool_result',
        toolCallId: event.toolCallId,
        result: toolResultText(event.result),
      };
    case 'message_end': {
      const msg = event.message;
      if (!msg || msg.role !== 'assistant') return null;
      if (msg.stopReason === 'error') {
        return { type: 'error', error: msg.errorMessage || 'Agent error' };
      }
      if (msg.usage) {
        return { type: 'usage', usage: piUsageToLegacyChunk(msg.usage), partial: false };
      }
      return null;
    }
    case 'agent_end':
      return { type: 'done' };
    default:
      return null;
  }
}

/** Read the last user message text from a pi message list. */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((b) => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
        .filter(Boolean)
        .join(' ');
    }
  }
  return '';
}

function detectHarmfulContent(text) {
  if (!text || typeof text !== 'string') return null;
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) return 'Request blocked by Dome guardrails.';
  }
  return null;
}

/** Count how many times `toolName` was already requested across history. */
function countPriorToolCalls(messages, toolName) {
  if (!Array.isArray(messages) || !toolName) return 0;
  let count = 0;
  for (const m of messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block && block.type === 'toolCall' && block.name === toolName) count += 1;
    }
  }
  return count;
}

/**
 * Build the `beforeToolCall` hook: enforces creation/mutation caps and (when
 * configured) human-in-the-loop approval. Returns `{ block, reason }` to deny.
 */
function buildBeforeToolCall(opts, caps) {
  const limits = { ...CREATION_TOOL_CAPS, ...(opts.caps || {}) };
  const requiresApproval = opts.skipHitl ? null : opts.requiresApproval;
  const requestApproval = opts.skipHitl ? null : opts.requestApproval;

  const needsApproval = (name) => {
    if (!requiresApproval || typeof requestApproval !== 'function') return false;
    if (typeof requiresApproval === 'function') return requiresApproval({ name });
    if (requiresApproval instanceof Set) return requiresApproval.has(name);
    if (Array.isArray(requiresApproval)) return requiresApproval.includes(name);
    return false;
  };

  return async function beforeToolCall(ctx) {
    const name = ctx?.toolCall?.name;
    if (!name) return undefined;

    // Caps: block when the cap has already been reached in history.
    const runLimit = limits[name];
    if (typeof runLimit === 'number' && runLimit > 0) {
      const prior = countPriorToolCalls(ctx.context?.messages, name);
      if (prior > runLimit) {
        return {
          block: true,
          reason:
            `Error: tool "${name}" reached its run limit (${runLimit} invocations). ` +
            'The agent will continue without executing this call.',
        };
      }
    }

    // HITL approval.
    if (needsApproval(name)) {
      const approved = await requestApproval(ctx.toolCall);
      if (!approved) {
        return { block: true, reason: 'Tool call declined by the user.' };
      }
    }

    return undefined;
  };
}

/**
 * Build a `transformContext` that performs summarization-based compaction when
 * the conversation approaches the model context window. Falls back to the
 * original messages on any error (the loop contract forbids throwing here).
 */
function buildCompaction(core, piModel, apiKey) {
  const settings = core.DEFAULT_COMPACTION_SETTINGS;
  return async function transformContext(messages, signal) {
    try {
      const window = piModel && piModel.contextWindow ? piModel.contextWindow : 0;
      if (!window) return messages;
      const estimate = core.estimateContextTokens(messages);
      if (!core.shouldCompact(estimate.tokens, window, settings)) return messages;

      // Walk back from the end keeping roughly `keepRecentTokens`.
      let acc = 0;
      let cut = 0;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        acc += core.estimateTokens(messages[i]);
        if (acc > settings.keepRecentTokens) {
          cut = i + 1;
          break;
        }
      }
      if (cut <= 0) return messages;

      const toSummarize = messages.slice(0, cut);
      const recent = messages.slice(cut);
      const result = await core.generateSummary(
        toSummarize,
        piModel,
        settings.reserveTokens,
        apiKey || '',
        undefined,
        signal,
      );
      const summary =
        typeof result === 'string'
          ? result
          : result && result.ok && typeof result.value === 'string'
            ? result.value
            : '';
      if (!summary) return messages;

      const summaryMessage = {
        role: 'user',
        content: [{ type: 'text', text: `[Conversation summary]\n${summary}` }],
        timestamp: Date.now(),
      };
      return [summaryMessage, ...recent];
    } catch (err) {
      console.error('[AgentRuntime] compaction skipped:', err && err.message ? err.message : err);
      return messages;
    }
  };
}

/** Build a `shouldStopAfterTurn` that bounds the run to `limit` turns. */
function buildTurnLimiter(limit) {
  let turns = 0;
  return function shouldStopAfterTurn() {
    turns += 1;
    return turns >= limit;
  };
}

/** Run any agent surface through the Dome-native `@dome/agent-core` loop. */
async function runAgent(surface, opts) {
  return runDomeAgent(surface, opts);
}

/** Run the Many surface. Thin wrapper kept for existing callers. */
function runManyAgent(opts) {
  return runAgent('many', opts);
}

/**
 * Dome-native path (gated by `DOME_AGENT_RUNTIME[_<SURFACE>]`). Drives
 * `@dome/agent-core`'s agent loop and relays events to `onChunk` via
 * `mapAgentEventToChunk`. Returns the final assistant response text.
 */
async function runDomeAgent(surface, opts) {
  console.log(`[AgentRuntime] ⚡ Dome-native @dome/agent-core runtime — ${surface}`);
  const core = await import('@dome/agent-core');
  const ai = await import('@dome/ai');
  const toolsPkg = await import('@dome/tools');
  const dispatcher = require('../tools/tool-dispatcher.cjs');

  const { provider, model, apiKey, baseUrl, messages, onChunk, signal, thinkingLevel } = opts;

  const sysMsg = Array.isArray(messages) ? messages.find((m) => m && m.role === 'system') : null;
  const systemPrompt =
    typeof sysMsg?.content === 'string'
      ? sysMsg.content
      : sysMsg
        ? JSON.stringify(sysMsg.content ?? '')
        : '';
  const nonSystem = (Array.isArray(messages) ? messages : []).filter((m) => m && m.role !== 'system');

  const piModel = ai.resolveDomeModel({ provider, model, baseUrl });
  const piMessages = ai.legacyMessagesToContext(systemPrompt, nonSystem).messages;

  // Guardrails: block clearly harmful requests before the first model call.
  if (process.env.DOME_GUARDRAILS === '1') {
    const reason = detectHarmfulContent(lastUserText(piMessages));
    if (reason) {
      if (typeof onChunk === 'function') {
        onChunk({ type: 'text', text: reason });
        onChunk({ type: 'done' });
      }
      return reason;
    }
  }

  const executeToolInMain = (name, args) =>
    dispatcher.executeToolInMain(name, args, opts.runtimeContext);
  const tools = toolsPkg.createToolRegistry(opts.toolDefinitions, { executeToolInMain });

  const context = { systemPrompt, messages: piMessages, tools };
  const config = {
    model: piModel,
    apiKey,
    reasoning: ai.mapThinkingLevel(thinkingLevel),
    convertToLlm: (msgs) =>
      msgs.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'),
    transformContext: buildCompaction(core, piModel, apiKey),
    beforeToolCall: buildBeforeToolCall(opts),
    toolExecution: 'parallel',
    shouldStopAfterTurn: buildTurnLimiter(recursionLimit()),
  };

  const emit = (event) => {
    const chunk = mapAgentEventToChunk(event);
    if (chunk && typeof onChunk === 'function') onChunk(chunk);
  };

  const newMessages = await core.runAgentLoop([], context, config, emit, signal);

  // Final response text = last assistant message text.
  let finalText = '';
  for (let i = newMessages.length - 1; i >= 0; i -= 1) {
    const m = newMessages[i];
    if (m && m.role === 'assistant') {
      finalText = assistantText(m);
      break;
    }
  }
  return finalText;
}

module.exports = {
  resolveRuntime,
  mapAgentEventToChunk,
  runAgent,
  runManyAgent,
  runDomeAgent,
  // exported for tests
  detectHarmfulContent,
  countPriorToolCalls,
  CREATION_TOOL_CAPS,
};
