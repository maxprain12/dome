/* eslint-disable no-console */
const { PREAMBLE_TOOLS } = require('./tool-scope.cjs');

/**
 * Layer 0: execution outcome from chunks / errors
 */
function validateExecution({ chunks, error, timedOut, hitInterrupt, skipHitl }) {
  if (timedOut) {
    return { pass: false, layer: 'execution', reason: 'Timeout exceeded' };
  }
  if (error) {
    return { pass: false, layer: 'execution', reason: error };
  }
  if (hitInterrupt && skipHitl !== false) {
    return { pass: false, layer: 'execution', reason: 'Unexpected HITL interrupt' };
  }
  const hasDone = chunks.some((c) => c.type === 'done');
  const hasErrorChunk = chunks.some((c) => c.type === 'error');
  if (hasErrorChunk) {
    const errChunk = chunks.find((c) => c.type === 'error');
    return { pass: false, layer: 'execution', reason: errChunk?.error || 'Stream error chunk' };
  }
  if (!hasDone) {
    return { pass: false, layer: 'execution', reason: 'No done chunk received' };
  }
  return { pass: true, layer: 'execution' };
}

/**
 * Layer 1: structural — expected_tools subset, forbidden absent, output_shape
 */
function validateStructural({
  expectedTools = [],
  forbiddenTools = [],
  toolsCalled = [],
  finalText = '',
  outputShape = null,
}) {
  const called = new Set(toolsCalled);
  const missing = expectedTools.filter((t) => !called.has(t));
  const forbiddenHit = forbiddenTools.filter((t) => called.has(t));

  if (missing.length) {
    return {
      pass: false,
      layer: 'structural',
      reason: `Missing expected tools: ${missing.join(', ')}`,
      missing,
      forbiddenHit,
    };
  }
  if (forbiddenHit.length) {
    return {
      pass: false,
      layer: 'structural',
      reason: `Forbidden tools called: ${forbiddenHit.join(', ')}`,
      missing,
      forbiddenHit,
    };
  }

  if (outputShape) {
    const text = finalText || '';
    if (outputShape.min_length && text.length < outputShape.min_length) {
      return {
        pass: false,
        layer: 'structural',
        reason: `Output too short (${text.length} < ${outputShape.min_length})`,
      };
    }
    if (outputShape.contains_any?.length) {
      const lower = text.toLowerCase();
      const hit = outputShape.contains_any.some((s) => lower.includes(String(s).toLowerCase()));
      if (!hit) {
        return {
          pass: false,
          layer: 'structural',
          reason: `Output missing any of: ${outputShape.contains_any.join(', ')}`,
        };
      }
    }
    if (outputShape.regex) {
      const re = new RegExp(outputShape.regex, outputShape.regex_flags || 'i');
      if (!re.test(text)) {
        return { pass: false, layer: 'structural', reason: `Output does not match regex: ${outputShape.regex}` };
      }
    }
  }

  return { pass: true, layer: 'structural' };
}

function deriveOutcome(execution, structural, judge, optional, execFailed) {
  if (optional && execFailed) return 'SKIP';
  if (!execution.pass) {
    if (optional) return 'SKIP';
    return 'FAIL_EXEC';
  }
  if (!structural.pass) {
    const toolsOk =
      (structural.missing?.length ?? 0) === 0 && (structural.forbiddenHit?.length ?? 0) === 0;
    const reason = structural.reason || '';
    const outputOnlyFail =
      reason.includes('Output') || reason.includes('regex') || reason.includes('too short');
    if (toolsOk && outputOnlyFail && judge?.pass && judge.skipped !== true) {
      return 'PASS';
    }
    return 'FAIL_STRUCTURAL';
  }
  if (judge && !judge.skipped && judge.pass === false) return 'FAIL_JUDGE';
  return 'PASS';
}

module.exports = {
  validateExecution,
  validateStructural,
  deriveOutcome,
};
