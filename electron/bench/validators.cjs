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

function validateOutputShape(outputShape, finalText) {
  if (!outputShape) return null;
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
  return null;
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
  behavior = null,
  chunks = [],
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

  const shapeFailure = validateOutputShape(outputShape, finalText);
  if (shapeFailure) {
    return shapeFailure;
  }

  const behaviorFailure = validateBehavior(behavior, chunks);
  if (behaviorFailure) return behaviorFailure;

  return { pass: true, layer: 'structural' };
}

function uniqueToolCalls(chunks) {
  const seen = new Set();
  const calls = [];
  for (const chunk of chunks || []) {
    if (chunk.type !== 'tool_call') continue;
    const name = chunk.toolCall?.name || chunk.name;
    if (!name) continue;
    const id = chunk.toolCall?.id || chunk.toolCallId || `${name}:${JSON.stringify(chunk.toolCall?.arguments || '')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    calls.push({ id, name });
  }
  return calls;
}

function validateBehavior(behavior, chunks) {
  if (!behavior) return null;
  const calls = uniqueToolCalls(chunks);
  if (behavior.max_tool_calls != null && calls.length > behavior.max_tool_calls) {
    return { pass: false, layer: 'structural', reason: `Behavior exceeded max tool calls (${calls.length} > ${behavior.max_tool_calls})` };
  }
  if (behavior.max_attempts_per_tool != null) {
    const counts = new Map();
    for (const call of calls) counts.set(call.name, (counts.get(call.name) || 0) + 1);
    const excessive = [...counts.entries()].find(([, count]) => count > behavior.max_attempts_per_tool);
    if (excessive) {
      return { pass: false, layer: 'structural', reason: `Behavior repeated tool ${excessive[0]} ${excessive[1]} times` };
    }
  }
  if (behavior.max_turns != null) {
    const turns = (chunks || []).filter((chunk) => chunk.type === 'harness' && chunk.event === 'turn_start').length;
    if (turns > behavior.max_turns) {
      return { pass: false, layer: 'structural', reason: `Behavior exceeded max turns (${turns} > ${behavior.max_turns})` };
    }
  }
  if (behavior.require_tool_result && !(chunks || []).some((chunk) => chunk.type === 'tool_result')) {
    return { pass: false, layer: 'structural', reason: 'Behavior finalized without a tool result' };
  }
  if (behavior.require_text_after_last_tool) {
    const lastTool = (chunks || []).findLastIndex((chunk) => chunk.type === 'tool_result');
    const hasLaterText = lastTool >= 0 && (chunks || []).slice(lastTool + 1).some((chunk) => chunk.type === 'text' && String(chunk.text || '').trim());
    if (!hasLaterText) return { pass: false, layer: 'structural', reason: 'Behavior produced no final text after the last tool result' };
  }
  return null;
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
  validateBehavior,
};
