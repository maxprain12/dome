/** Max chars stored in renderer state for a single tool result payload. */
export const RENDERER_TOOL_RESULT_MAX_CHARS = 32_000;

/**
 * Truncate oversized tool results before they enter React state / JSON.parse paths.
 */
export function truncateToolResultForRenderer(result: unknown): unknown {
  if (typeof result === 'string') {
    if (result.length <= RENDERER_TOOL_RESULT_MAX_CHARS) return result;
    return (
      result.slice(0, RENDERER_TOOL_RESULT_MAX_CHARS) +
      `\n\n[… truncated for UI — ${result.length} chars total]`
    );
  }

  if (result && typeof result === 'object') {
    try {
      const serialized = JSON.stringify(result);
      if (serialized.length <= RENDERER_TOOL_RESULT_MAX_CHARS) return result;
      return (
        serialized.slice(0, RENDERER_TOOL_RESULT_MAX_CHARS) +
        `\n\n[… truncated for UI — ${serialized.length} chars total]`
      );
    } catch {
      return result;
    }
  }

  return result;
}
