/**
 * Pure run-engine helpers (04/T05 fase 2 — extracted from run-engine.cjs).
 * No Electron, no DB — unit-tested in electron/__tests__/run-helpers.test.mjs.
 */

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
    return JSON.stringify(result ?? null);
  } catch {
    return String(result);
  }
}

function getToolStepPatch(toolCallId, result, extraMetadata = {}) {
  const serializedResult = serializeToolResult(result);
  let parsedResult = result;
  if (typeof serializedResult === 'string') {
    try {
      parsedResult = JSON.parse(serializedResult);
    } catch {
      parsedResult = result;
    }
  }

  const isErrorResult =
    parsedResult &&
    typeof parsedResult === 'object' &&
    !Array.isArray(parsedResult) &&
    parsedResult.status === 'error';

  const errorMessage = isErrorResult
    ? (typeof parsedResult.error === 'string' ? parsedResult.error : serializedResult)
    : null;

  return {
    status: isErrorResult ? 'failed' : 'done',
    content: errorMessage || serializedResult,
    metadata: {
      toolCallId,
      ...extraMetadata,
      ...(isErrorResult ? { error: errorMessage } : {}),
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
