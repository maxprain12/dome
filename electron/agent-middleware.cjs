'use strict';

/* eslint-disable no-console */
/**
 * Central LangChain / DeepAgents middleware stack for Dome agents.
 *
 * Used by langgraph-agent.cjs (full profile), subagents.cjs, and agent-team.cjs
 * (worker profile). Order matters: outer middleware runs first on each model call.
 */

const { buildGuardrailsMiddleware } = require('./guardrails.cjs');
const { createDeterministicToolSelectorMiddleware } = require('./tool-selector.cjs');

/** Per-turn caps for creation / mutation tools (replaces CREATION_TOOL_CAPS in langgraph-agent). */
const CREATION_TOOL_CAPS = {
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

/** Graph step budget; kept in sync with `RECURSION_LIMIT` in langgraph-agent.cjs. */
function getRecursionBudget() {
  const n = Number(process.env.DOME_RECURSION_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1500;
}

/**
 * Resolve a middleware run/thread cap from env override or a fraction of the
 * recursion budget (separate defaults for full vs worker profiles).
 * @param {string} envKey
 * @param {number} fullFraction
 * @param {number} workerFraction
 * @param {'full' | 'worker' | 'bench'} profile
 */
function resolveMiddlewareLimit(envKey, fullFraction, workerFraction, profile) {
  const explicit = Number(process.env[envKey]);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const budget = getRecursionBudget();
  const fraction = profile === 'worker' ? workerFraction : fullFraction;
  return Math.max(1, Math.floor(budget * fraction));
}

/** User-visible message when model/tool call limit middleware ends the run. */
function buildMiddlewareLimitReachedMessage({ hitModelCallLimit, hitToolCallLimit } = {}) {
  const parts = [];
  if (hitModelCallLimit) parts.push('límite de llamadas al modelo');
  if (hitToolCallLimit) parts.push('límite de invocaciones de herramientas');
  if (parts.length === 0) return null;
  const budget = getRecursionBudget();
  return (
    `El agente alcanzó el ${parts.join(' y el ')} de esta ejecución (presupuesto alineado con recursionLimit=${budget}).\n\n` +
    'Para flujos aún más largos, sube `DOME_RECURSION_LIMIT` y los overrides opcionales ' +
    '`DOME_MODEL_CALL_RUN_LIMIT` / `DOME_TOOL_CALL_RUN_LIMIT`, o desactiva los límites con ' +
    '`DOME_LANGGRAPH_MODEL_CALL_LIMIT=0` y/o `DOME_LANGGRAPH_TOOL_CALL_LIMIT=0`.'
  );
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
    msg.includes('etimedout') ||
    msg.includes('empty response') ||
    msg.includes('received empty response')
  );
}

/** @param {unknown} m */
function getMessageType(m) {
  if (!m || typeof m !== 'object') return '';
  if (typeof m._getType === 'function') return m._getType();
  if (typeof m.getType === 'function') return m.getType();
  return m._message_type || m.type || m.role || '';
}

/** @param {unknown} m */
function isHumanMsg(m) {
  const t = getMessageType(m);
  return t === 'human' || t === 'user';
}

/** Estimate chars for trim budget — vision/base64 payloads count as small placeholders unless preserved. */
function estimateContentChars(content) {
  if (typeof content === 'string') {
    if (content.includes('image_base64') && content.length > 4000) {
      try {
        const parsed = JSON.parse(content);
        if (parsed?.slides) return 1800;
      } catch {
        /* keep literal length */
      }
    }
    return content.length;
  }
  if (!Array.isArray(content)) return JSON.stringify(content ?? '').length;
  return content.reduce((sum, block) => {
    if (!block || typeof block !== 'object') return sum + 50;
    if (block.type === 'image_url') {
      const url = block.image_url?.url || '';
      if (String(url).startsWith('data:')) return sum + 220;
    }
    if (block.type === 'image' && block.source?.type === 'base64') return sum + 220;
    if (block.type === 'video') return sum + 320;
    if (block.type === 'text') return sum + String(block.text || '').length;
    return sum + 100;
  }, 0);
}

/** @param {unknown[]} msgs */
function budgetCharTokenCounter(msgs) {
  return msgs.reduce((sum, m) => sum + Math.ceil(estimateContentChars(m?.content) / 4), 0);
}

/** Strip heavy vision/base64 from older tool results before trim (keep latest QA images). */
function findLatestVisionMessageIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    if (Array.isArray(content) && content.some((b) => b && (b.type === 'image_url' || b.type === 'image'))) {
      return i;
    }
    if (typeof content === 'string' && content.includes('image_base64') && content.length > 4000) {
      return i;
    }
  }
  return -1;
}

/** @param {unknown} m @param {boolean} preserveVision */
function lightenMessageForTrim(m, preserveVision) {
  if (preserveVision || !m || typeof m !== 'object') return m;
  let content = m.content;
  if (typeof content === 'string' && content.includes('image_base64') && content.length > 4000) {
    try {
      const parsed = JSON.parse(content);
      if (parsed?.slides) {
        content = JSON.stringify({
          success: parsed.success,
          resource_id: parsed.resource_id,
          slide_count: parsed.slides.length,
          note: '[slide images omitted from history — visual QA already consumed]',
          delivery: 'vision_blocks',
        });
      }
    } catch {
      /* keep */
    }
  } else if (Array.isArray(content)) {
    const hasVision = content.some(
      (b) => b && (b.type === 'image_url' || b.type === 'image' || b.type === 'video'),
    );
    if (hasVision) {
      const textParts = content
        .filter((b) => b && b.type === 'text' && b.text)
        .map((b) => b.text)
        .join('\n');
      content = [
        {
          type: 'text',
          text:
            (textParts ? `${textParts}\n` : '') +
            '[visual tool result omitted from history — re-call ppt_get_slide_images if needed]',
        },
      ];
    }
  }
  if (content !== m.content) {
    m.content = content;
  }
  return m;
}

/** Never send an empty message list to the provider (MiniMax error 2013). */
function ensureNonEmptyTrimmed(original, trimmed) {
  if (Array.isArray(trimmed) && trimmed.length > 0) return trimmed;
  if (!Array.isArray(original) || original.length === 0) return trimmed || [];

  let lastHumanIdx = -1;
  for (let i = original.length - 1; i >= 0; i -= 1) {
    if (isHumanMsg(original[i])) {
      lastHumanIdx = i;
      break;
    }
  }
  if (lastHumanIdx >= 0) return original.slice(lastHumanIdx);
  return original.slice(-Math.min(4, original.length));
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

  const tokenCounter = budgetCharTokenCounter;

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

      const sysBudget = Math.ceil(
        String(updatedRequest.systemPrompt || updatedRequest.systemMessage?.content || '').length / 4,
      );
      const messageBudget = Math.max(12_000, maxTokens - sysBudget - 4096);

      const visionIdx = findLatestVisionMessageIndex(messages);
      const lightened = messages.map((m, i) => lightenMessageForTrim(m, i === visionIdx));

      try {
        let trimmed = await trimMessages(lightened, {
          maxTokens: messageBudget,
          tokenCounter,
          strategy: 'last',
          includeSystem: false,
          startOn: 'human',
          endOn: ['human', 'tool'],
        });
        trimmed = ensureNonEmptyTrimmed(lightened, trimmed);
        if (trimmed.length < messages.length) {
          console.log(
            `[AI LangGraph] trimmed ${messages.length - trimmed.length} messages → ${trimmed.length} (budget ${messageBudget}, ${provider})`,
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
  // Scales with DOME_RECURSION_LIMIT (default 1500). Artifact/studio flows with many
  // resource_* + artifact_update_state iterations need headroom below recursionLimit.
  const runLimit = resolveMiddlewareLimit('DOME_MODEL_CALL_RUN_LIMIT', 0.55, 0.4, profile);
  const threadLimit = resolveMiddlewareLimit('DOME_MODEL_CALL_THREAD_LIMIT', 0.9, 0.7, profile);
  return modelCallLimitMiddleware({ runLimit, threadLimit, exitBehavior: 'continue' });
}

/**
 * Count tool-call invocations for `toolName` already present in agent messages.
 * Includes the current call if it appears in the latest AIMessage tool_calls.
 * @param {unknown[]} messages
 * @param {string} toolName
 */
function countToolCallsInMessages(messages, toolName) {
  if (!Array.isArray(messages) || !toolName) return 0;
  let count = 0;
  for (const message of messages) {
    const toolCalls = message?.tool_calls ?? message?.lc_kwargs?.tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    for (const call of toolCalls) {
      if (call?.name === toolName) count += 1;
    }
  }
  return count;
}

/**
 * Single middleware replacing N per-tool `toolCallLimitMiddleware` graph nodes.
 * Enforces CREATION_TOOL_CAPS via wrapToolCall (blocks with ToolMessage error,
 * does not abort the run — equivalent to exitBehavior: 'continue').
 */
async function createDomeToolCallCapsMiddleware() {
  const { createMiddleware } = await import('langchain');
  const { ToolMessage } = await import('@langchain/core/messages');

  return createMiddleware({
    name: 'DomeToolCallCaps',
    wrapToolCall: async (request, handler) => {
      const toolName = request?.toolCall?.name;
      const runLimit = toolName ? CREATION_TOOL_CAPS[toolName] : undefined;
      if (!toolName || typeof runLimit !== 'number' || runLimit <= 0) {
        return handler(request);
      }

      const priorCount = countToolCallsInMessages(request?.state?.messages, toolName);
      if (priorCount <= runLimit) {
        return handler(request);
      }

      const toolCallId = request?.toolCall?.id || `blocked-${toolName}`;
      return new ToolMessage({
        content:
          `Error: tool "${toolName}" reached its run limit (${runLimit} invocations). ` +
          'The agent will continue without executing this call.',
        tool_call_id: toolCallId,
        status: 'error',
      });
    },
  });
}

async function createToolCallLimitMiddlewareStack(profile) {
  if (envDisabled('DOME_LANGGRAPH_TOOL_CALL_LIMIT')) return [];
  const { toolCallLimitMiddleware } = await import('langchain');
  const stack = [
    toolCallLimitMiddleware({
      threadLimit: resolveMiddlewareLimit('DOME_TOOL_CALL_THREAD_LIMIT', 0.95, 0.75, profile),
      runLimit: resolveMiddlewareLimit('DOME_TOOL_CALL_RUN_LIMIT', 0.75, 0.5, profile),
      exitBehavior: 'continue',
    }),
    await createDomeToolCallCapsMiddleware(),
  ];
  return stack;
}

/** Flatten a ToolMessage content (string | array of parts) into plain text. */
function toolMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' && 'text' in c ? c.text || '' : ''))
      .join('\n');
  }
  return content == null ? '' : String(content);
}

/**
 * Map a tool-error message to an actionable hint, or null if none applies.
 * Detection is by error text (not tool name) so it covers write_file/edit_file/
 * file_write and every browser tool that surfaces "No page found".
 * @param {string} text
 */
function hintForToolError(text) {
  if (!text) return null;
  if (/permission denied for (write|edit|create|delete)/i.test(text)) {
    return (
      'Hint: the harness filesystem only allows writes under `/memories/`. ' +
      'To deliver HTML, an interactive mini-app, a dashboard, or any visual artifact to the user, ' +
      'call `artifact_create` (persisted library mini-app) instead of `write_file`. ' +
      'For notes/documents/reports use `resource_create` (type "note"). ' +
      'Use `write_file` only for the agent\'s own scratch/memory files under `/memories/`.'
    );
  }
  if (/no page found/i.test(text)) {
    return (
      'Hint: there is no open browser page. Call `new_page` (or `navigate_page` with a URL) first, ' +
      'then `select_page` / `take_snapshot` / interact with the page.'
    );
  }
  return null;
}

/** True when a ToolMessage-like value already contains the hint (avoid double-append). */
function alreadyHinted(text) {
  return typeof text === 'string' && text.includes('\nHint: ');
}

/**
 * Middleware that enriches failing tool results with actionable recovery hints
 * so the model self-corrects on the next step instead of dead-ending:
 *  - write_file permission denied → suggest /memories/ or artifact_create
 *  - browser "No page found" → suggest new_page before select_page
 *
 * Post-processes the tool result (ToolMessage or Command) and also catches
 * thrown tool errors. Pure augmentation: never changes successful results.
 */
async function createDomeToolErrorHintsMiddleware() {
  const { createMiddleware } = await import('langchain');
  const { ToolMessage } = await import('@langchain/core/messages');

  const enrichToolMessage = (msg) => {
    const text = toolMessageText(msg?.content);
    if (alreadyHinted(text)) return msg;
    const hint = hintForToolError(text);
    if (!hint) return msg;
    return new ToolMessage({
      content: `${text}\n\n${hint}`,
      tool_call_id: msg?.tool_call_id,
      name: msg?.name,
      status: msg?.status ?? 'error',
    });
  };

  return createMiddleware({
    name: 'DomeToolErrorHints',
    wrapToolCall: async (request, handler) => {
      let result;
      try {
        result = await handler(request);
      } catch (err) {
        const text = String(err?.message ?? err ?? '');
        const hint = hintForToolError(text);
        if (!hint) throw err;
        return new ToolMessage({
          content: `Error: ${text}\n\n${hint}`,
          tool_call_id: request?.toolCall?.id || `error-${request?.toolCall?.name || 'tool'}`,
          name: request?.toolCall?.name,
          status: 'error',
        });
      }

      // ToolMessage result
      if (result && typeof result === 'object' && 'content' in result && !('update' in result) && !('goto' in result)) {
        return enrichToolMessage(result);
      }

      // Command result: enrich any ToolMessages carried in its update.messages
      if (result && typeof result === 'object' && result.update && Array.isArray(result.update.messages)) {
        const messages = result.update.messages.map((m) =>
          m && typeof m === 'object' && 'content' in m && 'tool_call_id' in m ? enrichToolMessage(m) : m,
        );
        result.update = { ...result.update, messages };
        return result;
      }

      return result;
    },
  });
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

/** When the runtime already binds ~128 tools, the selector's extra structured call often fails (duplicate JSON). */
const TOOL_SELECTOR_SKIP_ABOVE_COUNT = 100;

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isToolSelectorRecoverableError(err) {
  const msg = typeof err?.message === 'string' ? err.message : String(err ?? '');
  if (!msg) return false;
  return (
    msg.includes('Expected object response with tools array') ||
    msg.includes('OUTPUT_PARSING_FAILURE') ||
    msg.includes('Failed to parse') ||
    (msg.includes('SyntaxError') && msg.includes('after JSON')) ||
    (msg.includes('Unexpected non-whitespace character') && msg.includes('JSON'))
  );
}

function warnToolSelectorFallback(provider, reason) {
  const key = `${provider}:${reason}`;
  if (TOOL_SELECTOR_FALLBACK_WARNED.has(key)) return;
  TOOL_SELECTOR_FALLBACK_WARNED.add(key);
  console.warn(`[LLMToolSelector] provider=${provider} ${reason}; using full tool list.`);
}

/**
 * LangChain LLM tool selector (extra model call). Opt-in via DOME_LANGGRAPH_TOOL_SELECTOR_LLM=1.
 */
async function createLlmToolSelectorMiddlewareInner(tools, llm, provider) {
  const toolCount = Array.isArray(tools) ? tools.length : 0;
  if (toolCount > TOOL_SELECTOR_SKIP_ABOVE_COUNT) {
    warnToolSelectorFallback(
      provider,
      `LLM selector disabled (${toolCount} tools > ${TOOL_SELECTOR_SKIP_ABOVE_COUNT}); use deterministic selector`,
    );
    return null;
  }

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
        if (isToolSelectorRecoverableError(err)) {
          warnToolSelectorFallback(provider, 'recoverable parse/structured-output failure');
          return handler(request);
        }
        throw err;
      }
    };
  }

  return inner;
}

/**
 * Default tool narrowing: deterministic heuristics (no extra LLM call).
 * Set DOME_LANGGRAPH_TOOL_SELECTOR_LLM=1 to use LangChain's llmToolSelectorMiddleware instead.
 */
async function createToolSelectorMiddlewareMaybe(tools, llm, provider) {
  if (envDisabled('DOME_LANGGRAPH_TOOL_SELECTOR')) return null;
  if (TOOL_SELECTOR_UNSUPPORTED_PROVIDERS.has(provider)) return null;
  const toolCount = Array.isArray(tools) ? tools.length : 0;
  if (toolCount <= 15 && !envTruthy('DOME_LANGGRAPH_TOOL_SELECTOR')) return null;

  const presentNames = new Set(
    (Array.isArray(tools) ? tools : []).map(toolName).filter(Boolean),
  );
  const alwaysInclude = TOOL_SELECTOR_ALWAYS_INCLUDE.filter((n) => presentNames.has(n));

  if (envTruthy('DOME_LANGGRAPH_TOOL_SELECTOR_LLM')) {
    const llmMw = await createLlmToolSelectorMiddlewareInner(tools, llm, provider);
    if (llmMw) return llmMw;
  }

  return createDeterministicToolSelectorMiddleware(tools, {
    maxTools: 12,
    alwaysInclude,
  });
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
 * @param {'full' | 'worker' | 'bench'} [opts.profile='full'] — full = Many/main; worker = subagents; bench = harness (no FS/deepagents bleed)
 * @param {string} opts.provider
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} opts.llm
 * @param {unknown[]} [opts.tools=[]]
 * @param {boolean} [opts.skipHitl=false]
 * @param {import('langchain').AgentMiddleware | null} [opts.hitlMiddleware=null]
 * @param {import('langchain').AgentMiddleware | null} [opts.skillsMiddleware=null]
 * @param {import('@langchain/langgraph').BaseStore | null} [opts.store=null]
 * @param {boolean} [opts.enableFilesystem=false]
 * @param {'legacy' | 'deep'} [opts.harnessStack='legacy'] — when 'deep', omit middleware provided by createDeepAgent
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
    harnessStack = 'legacy',
  } = opts;

  const isDeepHarness = harnessStack === 'deep';

  const middleware = [];
  const toolCount = Array.isArray(tools) ? tools.length : 0;

  /** Benchmark harness: minimal stack — no filesystem, tool selector, or deepagents extras. */
  if (profile === 'bench') {
    const modelRetry = await createModelRetryMiddlewareMaybe();
    if (modelRetry) middleware.push(modelRetry);
    const toolRetry = await createToolRetryMiddlewareMaybe();
    if (toolRetry) middleware.push(toolRetry);
    middleware.push(await createTrimmingMiddleware(provider, llm));
    return middleware;
  }

  const modelCallLimit = await createModelCallLimitMiddlewareMaybe(profile);
  if (modelCallLimit) middleware.push(modelCallLimit);

  const guardrails = buildGuardrailsMiddleware();
  if (guardrails) middleware.push(guardrails);

  if (profile === 'full') {
    middleware.push(...(await createPiiMiddlewareStack()));
  }

  if (!isDeepHarness) {
    const summarization = await createSummarizationMiddlewareMaybe(provider, llm);
    if (summarization) middleware.push(summarization);
  }

  if (profile === 'full') {
    const contextEditing = await createContextEditingMiddlewareMaybe(provider);
    if (contextEditing) middleware.push(contextEditing);
  }

  middleware.push(...(await createToolCallLimitMiddlewareStack(profile)));

  if (!envDisabled('DOME_LANGGRAPH_TOOL_ERROR_HINTS')) {
    middleware.push(await createDomeToolErrorHintsMiddleware());
  }

  if (profile === 'full' && !skipHitl && hitlMiddleware && !isDeepHarness) {
    middleware.push(hitlMiddleware);
  }

  if (profile === 'full' && !isDeepHarness) {
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
    const toolSelector = await createToolSelectorMiddlewareMaybe(tools, llm, provider);
    if (toolSelector) middleware.push(toolSelector);

    const toolEmulator = await createToolEmulatorMiddlewareMaybe();
    if (toolEmulator) middleware.push(toolEmulator);
  }

  if (skillsMiddleware && !isDeepHarness) middleware.push(skillsMiddleware);

  if (!isDeepHarness && (enableFilesystem || profile === 'full')) {
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
  buildMiddlewareLimitReachedMessage,
  getRecursionBudget,
  createTrimmingMiddleware,
  createSummarizationMiddlewareMaybe,
};
