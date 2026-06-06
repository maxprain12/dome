'use strict';

/* eslint-disable no-console */
/**
 * Dome agent runtime selector (Phase 2 wiring).
 *
 * Routes an agent surface ("many", "agent-chat", "workflows", …) to either
 * the legacy LangGraph runtime (`electron/langgraph-agent.cjs`) or the new
 * Dome-native runtime (`@dome/agent-core`), based on `DOME_AGENT_RUNTIME`.
 *
 *   DOME_AGENT_RUNTIME_<SURFACE>  (e.g. DOME_AGENT_RUNTIME_MANY)  ── per-surface override
 *   DOME_AGENT_RUNTIME            ── global
 *   (default)                     ── 'langgraph'
 *
 * During Phase 2 the default is `langgraph`, so this module is a transparent
 * pass-through unless a flag is set. The `domeagent` branch is EXPERIMENTAL:
 * it must be smoke-tested against a live Many session (and validated with the
 * golden-transcript parity suite) before the default is flipped in Phase 6.
 *
 * The heavy `@dome/agent-core` import is lazy (only inside the `domeagent`
 * branch) so requiring this module never pulls the ESM runtime into the
 * CommonJS main process at load time.
 *
 * ⚠️ Naming: this is the runtime *selector*, not a "harness"
 * (`electron/harness-backend.cjs` is the deepagents filesystem backend).
 */

const DEFAULT_RECURSION_LIMIT = 25;

/** Map pi Usage to legacy renderer chunk shape. */
function piUsageToLegacyChunk(usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    totalTokens: usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0),
  };
}

function recursionLimit() {
  const n = Number(process.env.DOME_RECURSION_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RECURSION_LIMIT;
}

/**
 * Resolve which runtime a surface uses.
 * @param {string} surface e.g. 'many'
 * @returns {'langgraph'|'domeagent'|string}
 */
function resolveRuntime(surface) {
  const s = String(surface || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const override = process.env[`DOME_AGENT_RUNTIME_${s}`];
  if (override) return override;
  const env = process.env.DOME_AGENT_RUNTIME;
  if (env) return env;
  return 'langgraph';
}

/**
 * Map an `@dome/agent-core` `AgentEvent` to the legacy `onChunk` chunk shape
 * the renderer already consumes (see `electron/langgraph-agent.cjs`
 * streaming). Returns `null` for events with no renderer equivalent.
 */
function mapAgentEventToChunk(event) {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'text_delta':
      return { type: 'text', text: event.text };
    case 'thinking':
      return { type: 'thinking', text: event.text };
    case 'tool_call':
      return {
        type: 'tool_call',
        toolCall: {
          id: event.call.id,
          name: event.call.name,
          arguments:
            typeof event.call.arguments === 'string'
              ? event.call.arguments
              : JSON.stringify(event.call.arguments || {}),
        },
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolCallId: event.callId,
        result:
          event.output && typeof event.output.text === 'string'
            ? event.output.text
            : String(event.output == null ? '' : event.output),
      };
    case 'usage':
      return {
        type: 'usage',
        usage: piUsageToLegacyChunk(event.usage),
        partial: false,
      };
    case 'budget':
      return { type: 'budget', breakdown: event.breakdown };
    case 'error':
      return { type: 'error', error: event.error };
    case 'done':
      return { type: 'done' };
    // turn_start / turn_end / interrupt / artifact_block / retry have no
    // direct legacy chunk — the loop's other events cover the UI needs.
    default:
      return null;
  }
}

/**
 * Build a `StreamFn` over `@dome/ai.stream()` (pi SDK connectors).
 */
function createStreamFnAdapter({ provider, model, apiKey, baseUrl }) {
  return async function* streamFn(req) {
    try {
      const ai = await import('@dome/ai');
      const piModel = ai.resolveDomeModel({
        provider: req.model?.provider || provider,
        model: req.model?.model || model,
        baseUrl: req.model?.baseUrl || baseUrl,
      });

      const schemas = (req.tools || []).map((t) => t.schema).filter(Boolean);
      const context = ai.legacyMessagesToContext(req.systemPrompt || '', req.messages || [], schemas);

      const eventStream = ai.streamSimple(piModel, context, {
        apiKey: req.model?.apiKey || apiKey,
        signal: req.signal,
        reasoning: ai.mapThinkingLevel(req.thinkingLevel),
      });

      for await (const event of eventStream) {
        yield event;
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error('[AgentRuntime] StreamFn adapter error:', message);
      yield {
        type: 'error',
        reason: 'error',
        error: {
          role: 'assistant',
          content: [],
          api: 'openai-completions',
          provider: 'openai',
          model: 'unknown',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'error',
          errorMessage: message,
          timestamp: Date.now(),
        },
      };
    }
  };
}

/**
 * Run the Many surface. Default path is an exact pass-through to the legacy
 * `invokeLangGraphAgent` (behavior unchanged). The `domeagent` path is
 * experimental (see banner above).
 *
 * @param {object} opts same shape as `invokeLangGraphAgent` opts.
 * @returns {Promise<string|object>} final response text (or interrupt object).
 */
async function runManyAgent(opts) {
  const runtime = resolveRuntime('many');
  // Observable proof of which runtime handled this message (per-message, in the
  // main process). Set DOME_AGENT_RUNTIME_MANY=domeagent to use the new path.
  console.log(`[AgentRuntime] many → ${runtime}`);
  if (runtime !== 'domeagent') {
    return require('./langgraph-agent.cjs').invokeLangGraphAgent(opts);
  }

  console.log('[AgentRuntime] ⚡ Dome-native @dome/agent-core runtime (experimental)');
  // --- EXPERIMENTAL Dome-native path (gated by DOME_AGENT_RUNTIME[_MANY]) ---
  const core = await import('@dome/agent-core');
  const toolsPkg = await import('@dome/tools');
  const dispatcher = require('../tools/tool-dispatcher.cjs');
  const { provider, model, apiKey, baseUrl, messages, onChunk, signal, threadId } = opts;

  const sysMsg = Array.isArray(messages) ? messages.find((m) => m.role === 'system') : null;
  const systemPrompt = typeof sysMsg?.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg?.content ?? '');
  const nonSystem = (Array.isArray(messages) ? messages : []).filter((m) => m.role !== 'system');

  const executeToolInMain = (name, args) =>
    dispatcher.executeToolInMain(name, args, opts.runtimeContext);
  // Build the AgentTool[] registry from the OpenAI-style tool definitions,
  // bridging execution to the main-process dispatcher (@dome/tools).
  const tools = toolsPkg.createToolRegistry(opts.toolDefinitions, { executeToolInMain });

  const hooks = core.buildDefaultHooks({
    hitl: opts.skipHitl
      ? undefined
      : opts.requestApproval
        ? { requiresApproval: opts.requiresApproval, requestApproval: opts.requestApproval }
        : undefined,
  });

  const state = {
    systemPrompt,
    model: { provider, model, apiKey, baseUrl },
    thinkingLevel: 'off',
    tools,
    messages: nonSystem,
  };
  const config = {
    streamFn: createStreamFnAdapter({ provider, model, apiKey, baseUrl }),
    hooks,
    compaction: core.createDefaultCompaction(),
    recursionLimit: recursionLimit(),
    executeToolInMain,
    signal,
  };

  let finalText = '';
  for await (const event of core.runAgentLoop(state, config, { threadId, signal })) {
    if (event.type === 'text_delta') finalText += event.text;
    const chunk = mapAgentEventToChunk(event);
    if (chunk && typeof onChunk === 'function') onChunk(chunk);
  }
  return finalText;
}

module.exports = {
  resolveRuntime,
  mapAgentEventToChunk,
  createStreamFnAdapter,
  runManyAgent,
};
