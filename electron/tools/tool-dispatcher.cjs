/* eslint-disable no-console */
/**
 * Tool Dispatcher - Main Process
 *
 * Canonical registry and dispatcher for Dome tools in the main process.
 * Exposes:
 *   - TOOL_HANDLER_MAP / normalizeToolName: map of tool name → aiToolsHandler method
 *   - executeToolInMain(name, args, ctx): single entry point to run a tool call
 *   - getAllToolDefinitions / getToolDefinitionsByIds / getToolDefsBySubagent:
 *     OpenAI-format definitions consumed by the agent runtime (renderer chat,
 *     workflows, automations) and built into `@dome/tools` registries.
 *
 * There is no chat loop here. The agent loop lives in `@dome/agent-core`,
 * driven by electron/agents/agent-runtime.cjs.
 *
 * Per-handler argument shaping lives in tool-dispatcher-handlers.cjs (S3776).
 */

const {
  normalizeToolName,
  TOOL_HANDLER_MAP,
  getAllToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
} = require('./tool-definitions.cjs');
const { scopeToolPaths } = require('../coding/tool-path-scope.cjs');
const { invokeToolHandler } = require('./tool-dispatcher-handlers.cjs');
const logger = require('../core/logger.cjs');

const DEFAULT_TOOL_TIMEOUT_MS = Number(process.env.DOME_TOOL_TIMEOUT_MS) || 120_000;
const TOOL_TIMEOUT_OVERRIDES = {
  transcribe_audio: 600_000,
  notebook_run_cell: 300_000,
  ppt_create: 300_000,
  // Builds and test suites legitimately run for minutes. The shell tool has its
  // own optional per-call timeout and is cancellable, so this is only a backstop
  // against a wedged process, not the normal control.
  shell_exec: 1_800_000,
  web_fetch: 90_000,
  resource_index: 180_000,
  semantic_index_resource: 180_000,
};

function getToolTimeoutMs(toolName) {
  const normalized = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  return TOOL_TIMEOUT_OVERRIDES[normalized] ?? DEFAULT_TOOL_TIMEOUT_MS;
}

// Lazy-load ai-tools-handler to break the circular dependency:
// ai-tools-handler → pdf-transcription → cloud-llm.service → llm-service
//   → tool-dispatcher → ai-tools-handler (circular, returns {})
// By deferring the require to call time, the module is fully initialized.
let _aiToolsHandler = null;
function getAiToolsHandler() {
  if (!_aiToolsHandler) _aiToolsHandler = require('./ai-tools-handler.cjs');
  return _aiToolsHandler;
}

/**
 * Run one tool call (no timeout). Cognitive complexity kept low by dispatching
 * to per-handler invokers in tool-dispatcher-handlers.cjs.
 */
async function executeToolInMainImpl(toolName, rawArgs, toolContext) {
  const automationProjectId = toolContext?.automationProjectId ?? null;
  const normalizedToolName = normalizeToolName(toolName);

  // Coding runs anchor relative tool paths to the repository root so the model
  // never has to guess absolute paths (and cannot silently drift outside it).
  const { args } = scopeToolPaths(
    normalizedToolName,
    rawArgs,
    toolContext?.workspaceCwd ?? null,
  );

  const handlerName = TOOL_HANDLER_MAP[normalizedToolName];
  const aiToolsHandler = getAiToolsHandler();
  if (!handlerName || !aiToolsHandler[handlerName]) {
    return { status: 'error', error: `Tool not supported: ${toolName}` };
  }

  const fn = aiToolsHandler[handlerName];
  const ctx = {
    fn,
    args,
    toolContext,
    automationProjectId,
    getAiToolsHandler,
  };

  try {
    // deepResearch historically used `result = fn(args)` without await so a
    // rejected thenable bypasses this catch (same as returning it raw).
    if (handlerName === 'deepResearch') {
      return invokeToolHandler(handlerName, ctx);
    }
    return await invokeToolHandler(handlerName, ctx);
  } catch (error) {
    console.error('[AI Chat Tools] Tool execution error:', toolName, error);
    return { success: false, error: error.message };
  }
}

async function executeToolInMain(toolName, args, toolContext) {
  const timeoutMs = getToolTimeoutMs(toolName);
  let timer;
  try {
    return await Promise.race([
      executeToolInMainImpl(toolName, args, toolContext),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    if (String(err?.message || '').includes('timed out')) {
      logger.warn('tool-dispatcher', err.message, { tool: toolName, timeoutMs });
      return { status: 'error', error: err.message };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  executeToolInMain,
  normalizeToolName,
  TOOL_HANDLER_MAP,
  getAllToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
};
