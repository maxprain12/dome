/**
 * Pure run-engine helpers (04/T05 fase 2 — extracted from run-engine.cjs).
 * No Electron, no DB — unit-tested in electron/__tests__/run-helpers.test.mjs.
 */

// Pure-CJS leaf (no Electron/DB deps) — keeps this module unit-testable.
const { safeStringify, capResultText } = require('../tools/tool-result-cap.cjs');

function isRunAbortedError(error, signal) {
  if (signal?.aborted) return true;
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const msg = `${error.message || error}`.toLowerCase();
  return (
    msg.includes('abort')
    || msg.includes('terminated')
    || msg.includes('cancelled')
    || msg.includes('canceled')
    || msg.includes('body timeout')
  );
}

function parseToolArguments(rawArguments) {
  if (typeof rawArguments === 'string') {
    try {
      return JSON.parse(rawArguments);
    } catch {
      return {};
    }
  }
  return rawArguments && typeof rawArguments === 'object' ? rawArguments : {};
}

function mergeLlmUsage(current, delta) {
  if (!delta || typeof delta !== 'object') return current || null;
  const dIn = Math.max(0, Math.floor(Number(delta.inputTokens ?? delta.input_tokens ?? 0) || 0));
  const dOut = Math.max(0, Math.floor(Number(delta.outputTokens ?? delta.output_tokens ?? 0) || 0));
  const dTotRaw = delta.totalTokens ?? delta.total_tokens;
  const dTot =
    dTotRaw != null && dTotRaw !== ''
      ? Math.max(0, Math.floor(Number(dTotRaw) || 0))
      : dIn + dOut;
  if (!current) {
    return { inputTokens: dIn, outputTokens: dOut, totalTokens: dTot };
  }
  return {
    inputTokens: (current.inputTokens ?? 0) + dIn,
    outputTokens: (current.outputTokens ?? 0) + dOut,
    totalTokens: (current.totalTokens ?? 0) + dTot,
  };
}

function serializeToolResult(result) {
  if (typeof result === 'string') return result;
  try {
    // safeStringify bounds serialization so a huge tool result can't OOM the
    // main process inside V8's JsonStringify (ELECTRON-7).
    return safeStringify(result ?? null);
  } catch {
    return String(result);
  }
}

function getToolStepPatch(toolCallId, result, extraMetadata = {}, opts = {}) {
  const serializedResult = serializeToolResult(result);
  let parsedResult = result;
  if (typeof serializedResult === 'string') {
    try {
      parsedResult = JSON.parse(serializedResult);
    } catch {
      parsedResult = result;
    }
  }

  // `opts.isError` is the loop-level flag (@dome/agent-core sets it when the
  // tool threw); the JSON sniff below covers legacy handlers that encode
  // `{ status: 'error' }` in a successful result instead of throwing.
  const isErrorResult =
    opts.isError === true ||
    (parsedResult &&
      typeof parsedResult === 'object' &&
      !Array.isArray(parsedResult) &&
      parsedResult.status === 'error');

  const errorMessage = isErrorResult
    ? (typeof parsedResult.error === 'string' ? parsedResult.error : serializedResult)
    : null;

  // capResultText bounds the persisted step content. serializeToolResult /
  // safeStringify pass strings through untouched, so a multi-MB MCP result (e.g.
  // a chrome_devtools snapshot, already a string) would otherwise land verbatim
  // in automation_run_steps.content — bloating the DB and feeding the
  // JSON.stringify OOM (ELECTRON-7). The model already got the full result.
  return {
    status: isErrorResult ? 'failed' : 'done',
    content: capResultText(errorMessage || serializedResult),
    metadata: {
      toolCallId,
      ...extraMetadata,
      ...(isErrorResult ? { error: capResultText(errorMessage, { budgetChars: 8192 }) } : {}),
    },
  };
}

module.exports = {
  isRunAbortedError,
  parseToolArguments,
  mergeLlmUsage,
  serializeToolResult,
  getToolStepPatch,
};
