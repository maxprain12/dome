'use strict';

/* eslint-disable no-console */
/**
 * Central LangChain / DeepAgents middleware stack for Dome agents.
 *
 * Used by langgraph-agent.cjs (full profile), subagents.cjs, and agent-team.cjs
 * (worker profile). Order matters: outer middleware runs first on each model call.
 */

const { buildGuardrailsMiddleware } = require('./guardrails.cjs');

/** Per-turn caps for creation / mutation tools (replaces CREATION_TOOL_CAPS in langgraph-agent). */
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

/** Network tools that benefit from retry with backoff. */
const NETWORK_TOOL_NAMES = [
  'web_search',
  'web_fetch',
  'deep_research',
];

/**
 * Meta-tools always included when LLM tool selector runs.
 *
 * `get_tool_definition` is intentionally NOT here: it only exists in subagent
 * mode (`useDirectTools: false`). Listing a missing tool name throws
 * `MiddlewareError: Tools in alwaysInclude not found in request`.
 */
const TOOL_SELECTOR_ALWAYS_INCLUDE = [
  'dome_load_doc',
  'remember_fact',
];

/** Extract a normalised tool name from a LangChain ToolLike value. */
function toolName(t) {
  if (!t || typeof t !== 'object') return null;
  return t.name || t.lc_kwargs?.name || t.function?.name || null;
}

const PROVIDER_TOKEN_BUDGETS = {
  ollama: 8192,
  openai: 96000,
  anthropic: 160000,
  google: 800000,
  minimax: 160000,
  dome: 64000,
  openrouter: 128000,
};

const DEFAULT_TOKEN_BUDGET = 64000;

function envTruthy(key) {
  const v = String(process.env[key] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envDisabled(key) {
  const v = String(process.env[key] ?? '').toLowerCase().trim();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function shouldRetryModelError(error) {
  if (!error || typeof error !== 'object') return false;
  const statusCode =
    error.statusCode ??
    error.status ??
    error.response?.status ??
    error.response?.statusCode;
  if (statusCode === 429) return true;
  if (typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600) return true;
  const code = String(error.code || error.cause?.code || '').toLowerCase();
  if (
    code === 'econnreset' ||
    code === 'econnrefused' ||
    code === 'enotfound' ||
    code === 'eai_again' ||
    code === 'epipe' ||
    code === 'etimedout' ||
    code === 'und_err_socket' ||
    code === 'und_err_connect_timeout' ||
    code === 'und_err_headers_timeout' ||
    code === 'und_err_body_timeout'
  ) {
    return true;
  }
  const msg = String(error.message || error.name || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout')
  );
}

/**
 * Build a middleware that trims `request.messages` to fit the provider token budget.
 * @param {string} provider
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} llm
 */
async function createTrimmingMiddleware(provider, llm) {
  const { createMiddleware } = await import('langchain');
  const { trimMessages } = await import('@langchain/core/messages');
  const maxTokens = PROVIDER_TOKEN_BUDGETS[provider] ?? DEFAULT_TOKEN_BUDGET;

  const charTokenCounter = (msgs) =>
    msgs.reduce((sum, m) => {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + Math.ceil(text.length / 4);
    }, 0);

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
          const t =
            typeof m._getType === 'function'
              ? m._getType()
              : typeof m.getType === 'function'
                ? m.getType()
                : m._message_type || m.type || m.role || '';
          return t === 'system';
        } catch {
          return false;
        }
      };

      const getTextContent = (content) => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          return content
            .map((c) => {
              if (typeof c === 'string') return c;
              if (c && typeof c === 'object' && 'text' in c) return c.text || '';
              return '';
            })
            .join('\n');
        }
        return JSON.stringify(content);
      };

      const sysIdxs = messages.reduce((acc, m, i) => {
        if (isSystemMsg(m)) acc.push(i);
        return acc;
      }, []);

      let updatedRequest = request;
      if (sysIdxs.length > 0) {
        const sysTexts = sysIdxs.map((i) => getTextContent(messages[i].content));
        const fromSystemMessage = request.systemMessage?.content;
        const fromPromptString = typeof request.systemPrompt === 'string' ? request.systemPrompt : '';
        const existingContent = getTextContent(fromSystemMessage ?? fromPromptString ?? '');
        const allSysContent = [...sysTexts, existingContent].filter(Boolean).join('\n\n---\n\n');

        messages = messages.filter((_, i) => !sysIdxs.includes(i));
        updatedRequest = { ...request, messages, systemPrompt: allSysContent };
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
          console.log(
            `[AI LangGraph] trimmed ${messages.length - trimmed.length} messages → ${trimmed.length} (budget ${maxTokens}, ${provider})`,
          );
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
 * @param {string} provider
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} llm
 */
async function createSummarizationMiddlewareMaybe(provider, llm) {
  if (envDisabled('DOME_LANGGRAPH_SUMMARIZATION')) return null;
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

async function createModelCallLimitMiddlewareMaybe(profile) {
  if (envDisabled('DOME_LANGGRAPH_MODEL_CALL_LIMIT')) return null;
  const { modelCallLimitMiddleware } = await import('langchain');
  // Bumped from 30/100 → 80/300 (and worker 20/100 → 60/200). Persisted-artifact
  // + feeder flows easily hit 40+ model calls in a single run (create artifact,
  // create feeder, request secret, run, refresh, update_state, ...). Hitting the
  // limit triggers a final synthetic call in after_agent that, if the network
  // hiccups, surfaces as MiddlewareError: fetch failed and aborts the run.
  const runLimit = profile === 'worker' ? 60 : 80;
  const threadLimit = profile === 'worker' ? 200 : 300;
  return modelCallLimitMiddleware({ runLimit, threadLimit, exitBehavior: 'end' });
}

async function createToolCallLimitMiddlewareStack(profile) {
  if (envDisabled('DOME_LANGGRAPH_TOOL_CALL_LIMIT')) return [];
  const { toolCallLimitMiddleware } = await import('langchain');
  const stack = [
    toolCallLimitMiddleware({
      threadLimit: profile === 'worker' ? 100 : 200,
      runLimit: profile === 'worker' ? 50 : 100,
      exitBehavior: 'continue',
    }),
  ];
  for (const [toolName, runLimit] of Object.entries(CREATION_TOOL_CAPS)) {
    stack.push(
      toolCallLimitMiddleware({
        toolName,
        runLimit,
        exitBehavior: 'continue',
      }),
    );
  }
  return stack;
}

async function createPiiMiddlewareStack() {
  if (!envTruthy('DOME_PII_REDACT')) return [];
  const { piiMiddleware } = await import('langchain');
  return [
    piiMiddleware('email', { strategy: 'redact', applyToInput: false, applyToOutput: true }),
    piiMiddleware('credit_card', { strategy: 'redact', applyToInput: false, applyToOutput: true }),
  ];
}

async function createContextEditingMiddlewareMaybe(provider) {
  if (envDisabled('DOME_LANGGRAPH_CONTEXT_EDITING')) return null;
  const { contextEditingMiddleware, ClearToolUsesEdit } = await import('langchain');
  const maxTokens = PROVIDER_TOKEN_BUDGETS[provider] ?? DEFAULT_TOKEN_BUDGET;
  return contextEditingMiddleware({
    edits: [
      new ClearToolUsesEdit({
        trigger: { tokens: Math.floor(maxTokens * 0.8) },
        keep: { messages: 5 },
      }),
    ],
  });
}

/**
 * Dome-flavoured replacement for langchain's `todoListMiddleware()`.
 *
 * Behaves exactly like the upstream version (same name, same state schema, same
 * system prompt, same parallel-call guard), with one robustness fix:
 *
 *   The upstream schema is `{ todos: [{ content, status }] }`. Some models
 *   habitually emit `{ id, description, status }` (mirroring Claude Code's
 *   `TodoWrite` shape), which fails zod validation and breaks the run.
 *   We normalise via `z.preprocess` so `description` is accepted as an alias
 *   of `content` and any extra fields (e.g. `id`) are silently dropped before
 *   validation. The JSON Schema advertised to the model is unchanged.
 */
async function createTodoListMiddlewareMaybe() {
  if (envDisabled('DOME_LANGGRAPH_TODO_LIST')) return null;

  const { createMiddleware, todoListMiddleware, TODO_LIST_MIDDLEWARE_SYSTEM_PROMPT } =
    await import('langchain');
  const { tool } = await import('@langchain/core/tools');
  const { AIMessage, ToolMessage } = await import('@langchain/core/messages');
  const { Command } = await import('@langchain/langgraph');
  const { z } = await import('zod/v3');

  // Borrow the upstream tool description so the model still gets the full
  // usage guidelines (not exported as a constant; we read it off the tool).
  let writeTodosDescription;
  try {
    const upstream = todoListMiddleware();
    const upstreamTool = (upstream?.tools || []).find((t) => t?.name === 'write_todos');
    writeTodosDescription = typeof upstreamTool?.description === 'string'
      ? upstreamTool.description
      : undefined;
  } catch {
    writeTodosDescription = undefined;
  }

  const TodoStatus = z.enum(['pending', 'in_progress', 'completed']).describe('Status of the todo');

  // Normalise a single todo: keep canonical {content, status}; accept
  // `description` as alias; drop any other fields the model may add.
  const normaliseTodoInput = (val) => {
    if (!val || typeof val !== 'object') return val;
    const raw = /** @type {Record<string, unknown>} */ (val);
    const contentFromContent = typeof raw.content === 'string' ? raw.content : '';
    const contentFromDescription = typeof raw.description === 'string' ? raw.description : '';
    const content = contentFromContent.trim().length > 0 ? contentFromContent : contentFromDescription;
    return { content, status: raw.status };
  };

  const TodoItemSchema = z.preprocess(
    normaliseTodoInput,
    z.object({
      content: z.string().min(1).describe('Content of the todo item'),
      status: TodoStatus,
    })
  );

  const InputSchema = z.object({
    todos: z.array(TodoItemSchema).describe('List of todo items to update'),
  });

  const stateSchema = z.object({
    todos: z
      .array(z.object({ content: z.string(), status: TodoStatus }))
      .default([]),
  });

  const writeTodos = tool(
    ({ todos }, config) => new Command({
      update: {
        todos,
        messages: [
          new ToolMessage({
            content: `Updated todo list to ${JSON.stringify(todos)}`,
            tool_call_id: config?.toolCall?.id,
          }),
        ],
      },
    }),
    {
      name: 'write_todos',
      description: writeTodosDescription
        ?? 'Use this tool to create and manage a structured task list. Each item must be `{ "content": string, "status": "pending" | "in_progress" | "completed" }`.',
      schema: InputSchema,
    },
  );

  return createMiddleware({
    name: 'todoListMiddleware',
    stateSchema,
    tools: [writeTodos],
    wrapModelCall: (request, handler) => handler({
      ...request,
      systemMessage: request.systemMessage.concat(`\n\n${TODO_LIST_MIDDLEWARE_SYSTEM_PROMPT}`),
    }),
    afterModel: (state) => {
      const messages = state?.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;
      const lastAiMsg = [...messages].reverse().find((m) => AIMessage.isInstance(m));
      if (!lastAiMsg?.tool_calls?.length) return;
      const writeTodosCalls = lastAiMsg.tool_calls.filter((tc) => tc.name === writeTodos.name);
      if (writeTodosCalls.length <= 1) return;
      // Mirror upstream behaviour: reject parallel calls with explicit tool error messages.
      return {
        messages: writeTodosCalls.map((tc) => new ToolMessage({
          content:
            'Error: The `write_todos` tool should never be called multiple times in parallel. Please call it only once per model invocation to update the todo list.',
          tool_call_id: tc.id,
          status: 'error',
        })),
      };
    },
  });
}

async function createModelFallbackMiddlewareMaybe(provider) {
  if (envDisabled('DOME_LANGGRAPH_MODEL_FALLBACK')) return null;
  if (provider === 'ollama') return null;
  const { modelFallbackMiddleware } = await import('langchain');
  /** @type {Record<string, string[]>} */
  const chains = {
    dome: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-haiku-20241022'],
    openai: ['anthropic:claude-3-5-haiku-20241022', 'google:gemini-2.0-flash'],
    anthropic: ['openai:gpt-4o-mini', 'google:gemini-2.0-flash'],
    google: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-haiku-20241022'],
    minimax: ['openai:gpt-4o-mini'],
    openrouter: ['openai:gpt-4o-mini'],
  };
  const fallbacks = chains[provider];
  if (!fallbacks?.length) return null;
  return modelFallbackMiddleware(...fallbacks);
}

async function createModelRetryMiddlewareMaybe() {
  if (envDisabled('DOME_LANGGRAPH_MODEL_RETRY')) return null;
  const { modelRetryMiddleware } = await import('langchain');
  return modelRetryMiddleware({
    maxRetries: 3,
    retryOn: shouldRetryModelError,
    onFailure: 'continue',
  });
}

async function createToolRetryMiddlewareMaybe() {
  if (envDisabled('DOME_LANGGRAPH_TOOL_RETRY')) return null;
  const { toolRetryMiddleware } = await import('langchain');
  return toolRetryMiddleware({
    maxRetries: 2,
    tools: NETWORK_TOOL_NAMES,
    retryOn: shouldRetryModelError,
    onFailure: 'continue',
  });
}

/** Providers whose endpoints do not reliably support structured-output schemas. */
const TOOL_SELECTOR_UNSUPPORTED_PROVIDERS = new Set(['minimax', 'ollama', 'dome']);

/** Per-process flag so the structured-output fallback warning is logged only once per provider. */
const TOOL_SELECTOR_FALLBACK_WARNED = new Set();

async function createLlmToolSelectorMiddlewareMaybe(tools, llm, provider) {
  if (envDisabled('DOME_LANGGRAPH_TOOL_SELECTOR')) return null;
  if (TOOL_SELECTOR_UNSUPPORTED_PROVIDERS.has(provider)) return null;
  const toolCount = Array.isArray(tools) ? tools.length : 0;
  if (toolCount <= 15 && !envTruthy('DOME_LANGGRAPH_TOOL_SELECTOR')) return null;

  // Pre-check: the selector calls `llm.withStructuredOutput(...).invoke(...)` and
  // throws "Expected object response with tools array, got undefined" if the
  // model returns nothing (proxies / deterministic stubs / providers without
  // structured-output support). Skip the middleware entirely in that case.
  if (typeof llm?.withStructuredOutput !== 'function') {
    if (!TOOL_SELECTOR_FALLBACK_WARNED.has(provider)) {
      console.warn(
        `[LLMToolSelector] provider=${provider} model has no withStructuredOutput(); skipping selector middleware.`,
      );
      TOOL_SELECTOR_FALLBACK_WARNED.add(provider);
    }
    return null;
  }

  // alwaysInclude must reference tools that ARE in the runtime — otherwise the
  // selector throws MiddlewareError before the model is ever called.
  const presentNames = new Set(
    (Array.isArray(tools) ? tools : []).map(toolName).filter(Boolean),
  );
  const alwaysInclude = TOOL_SELECTOR_ALWAYS_INCLUDE.filter((n) => presentNames.has(n));
  const { llmToolSelectorMiddleware } = await import('langchain');
  const inner = llmToolSelectorMiddleware({
    model: llm,
    maxTools: 12,
    alwaysInclude,
  });

  // Runtime fallback: even when `withStructuredOutput` exists, some endpoints
  // (custom proxies, partial providers) return `undefined` from `.invoke()`,
  // which makes the upstream middleware throw and aborts the whole run with
  // `MiddlewareError: Expected object response with tools array, got undefined`.
  // Wrap `wrapModelCall` so that this specific failure degrades to "use the
  // full tool list" instead of crashing. Other selector errors still propagate.
  const innerWrap = typeof inner.wrapModelCall === 'function'
    ? inner.wrapModelCall.bind(inner)
    : null;
  if (innerWrap) {
    inner.wrapModelCall = async (request, handler) => {
      try {
        return await innerWrap(request, handler);
      } catch (err) {
        const msg = typeof err?.message === 'string' ? err.message : '';
        if (msg.includes('Expected object response with tools array')) {
          if (!TOOL_SELECTOR_FALLBACK_WARNED.has(provider)) {
            console.warn(
              `[LLMToolSelector] provider=${provider} returned undefined from withStructuredOutput; ` +
                'falling back to full tool list (suppressing further warnings).',
            );
            TOOL_SELECTOR_FALLBACK_WARNED.add(provider);
          }
          return handler(request);
        }
        throw err;
      }
    };
  }

  return inner;
}

async function createToolEmulatorMiddlewareMaybe() {
  if (!envTruthy('DOME_EMULATE_TOOLS')) return null;
  const { toolEmulatorMiddleware } = await import('langchain');
  return toolEmulatorMiddleware();
}

/**
 * @param {import('@langchain/langgraph').BaseStore | null | undefined} store
 */
async function createFilesystemMiddlewareMaybe(store) {
  if (envDisabled('DOME_LANGGRAPH_FILESYSTEM')) return null;
  if (!store) return null;
  try {
    const { createFilesystemMiddleware, CompositeBackend, StateBackend, StoreBackend } =
      await import('deepagents');
    return createFilesystemMiddleware({
      backend: new CompositeBackend(new StateBackend(), { '/memories/': new StoreBackend() }),
    });
  } catch (e) {
    console.warn('[AI LangGraph] createFilesystemMiddleware not loaded:', e?.message || e);
    return null;
  }
}

/**
 * Build the middleware array for a Dome agent graph.
 *
 * @param {Object} opts
 * @param {'full' | 'worker'} [opts.profile='full'] — full = Many/main; worker = subagents / team members
 * @param {string} opts.provider
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} opts.llm
 * @param {unknown[]} [opts.tools=[]]
 * @param {boolean} [opts.skipHitl=false]
 * @param {import('langchain').AgentMiddleware | null} [opts.hitlMiddleware=null]
 * @param {import('langchain').AgentMiddleware | null} [opts.skillsMiddleware=null]
 * @param {import('@langchain/langgraph').BaseStore | null} [opts.store=null]
 * @param {boolean} [opts.enableFilesystem=false]
 * @returns {Promise<import('langchain').AgentMiddleware[]>}
 */
async function buildAgentMiddlewareStack(opts) {
  const {
    profile = 'full',
    provider,
    llm,
    tools = [],
    skipHitl = false,
    hitlMiddleware = null,
    skillsMiddleware = null,
    store = null,
    enableFilesystem = false,
  } = opts;

  const middleware = [];
  const toolCount = Array.isArray(tools) ? tools.length : 0;

  const modelCallLimit = await createModelCallLimitMiddlewareMaybe(profile);
  if (modelCallLimit) middleware.push(modelCallLimit);

  const guardrails = buildGuardrailsMiddleware();
  if (guardrails) middleware.push(guardrails);

  if (profile === 'full') {
    middleware.push(...(await createPiiMiddlewareStack()));
  }

  const summarization = await createSummarizationMiddlewareMaybe(provider, llm);
  if (summarization) middleware.push(summarization);

  if (profile === 'full') {
    const contextEditing = await createContextEditingMiddlewareMaybe(provider);
    if (contextEditing) middleware.push(contextEditing);
  }

  middleware.push(...(await createToolCallLimitMiddlewareStack(profile)));

  if (profile === 'full' && !skipHitl && hitlMiddleware) {
    middleware.push(hitlMiddleware);
  }

  if (profile === 'full') {
    const todoList = await createTodoListMiddlewareMaybe();
    if (todoList) middleware.push(todoList);
  }

  if (profile === 'full') {
    const modelFallback = await createModelFallbackMiddlewareMaybe(provider);
    if (modelFallback) middleware.push(modelFallback);
  }

  const modelRetry = await createModelRetryMiddlewareMaybe();
  if (modelRetry) middleware.push(modelRetry);

  const toolRetry = await createToolRetryMiddlewareMaybe();
  if (toolRetry) middleware.push(toolRetry);

  if (profile === 'full') {
    const toolSelector = await createLlmToolSelectorMiddlewareMaybe(tools, llm, provider);
    if (toolSelector) middleware.push(toolSelector);

    const toolEmulator = await createToolEmulatorMiddlewareMaybe();
    if (toolEmulator) middleware.push(toolEmulator);
  }

  if (skillsMiddleware) middleware.push(skillsMiddleware);

  if (enableFilesystem || profile === 'full') {
    const fsMw = await createFilesystemMiddlewareMaybe(store);
    if (fsMw) middleware.push(fsMw);
  }

  middleware.push(await createTrimmingMiddleware(provider, llm));

  return middleware;
}

module.exports = {
  CREATION_TOOL_CAPS,
  PROVIDER_TOKEN_BUDGETS,
  DEFAULT_TOKEN_BUDGET,
  NETWORK_TOOL_NAMES,
  TOOL_SELECTOR_ALWAYS_INCLUDE,
  buildAgentMiddlewareStack,
  createTrimmingMiddleware,
  createSummarizationMiddlewareMaybe,
};
