import type { ToolCallData } from '@/components/chat/ChatToolCard';
import { truncateToolResultForRenderer } from '@/lib/chat/truncateToolResult';

function stableArgsKey(args: Record<string, unknown>): string {
  try {
    const raw = args || {};
    const keys = Object.keys(raw).sort((a, b) => a.localeCompare(b));
    const sorted: Record<string, unknown> = {};
    for (const k of keys) sorted[k] = raw[k];
    return JSON.stringify(sorted);
  } catch {
    return JSON.stringify(args ?? {});
  }
}

function fingerprint(tc: ToolCallData): string {
  return `${tc.name}\u0000${stableArgsKey(tc.arguments)}`;
}

/**
 * When the same tool+args appears multiple times (duplicate stream rows, ID skew, or
 * parallel calls where only one result surfaced), copy success/error onto siblings that
 * are still pending/running so the UI does not show a perpetual spinner.
 */
export function coalesceDuplicateToolCalls(calls: ToolCallData[]): ToolCallData[] {
  if (!calls?.length || calls.length <= 1) return calls;

  const byFp = new Map<string, ToolCallData[]>();
  for (const tc of calls) {
    const fp = fingerprint(tc);
    const arr = byFp.get(fp) ?? [];
    arr.push(tc);
    byFp.set(fp, arr);
  }

  const settled = new Map<string, { kind: 'success'; result?: unknown } | { kind: 'error'; error?: string; result?: unknown }>();
  for (const [fp, arr] of byFp) {
    if (arr.length < 2) continue;
    const ok = arr.find((c) => c.status === 'success');
    const bad = arr.find((c) => c.status === 'error');
    if (ok) settled.set(fp, { kind: 'success', result: ok.result });
    else if (bad) settled.set(fp, { kind: 'error', error: bad.error, result: bad.result });
  }

  const patched = calls.map((tc) => {
    const patch = settled.get(fingerprint(tc));
    if (!patch || (tc.status !== 'running' && tc.status !== 'pending')) return tc;
    if (patch.kind === 'success') {
      return { ...tc, status: 'success' as const, result: patch.result };
    }
    return {
      ...tc,
      status: 'error' as const,
      error: patch.error,
      result: patch.result,
    };
  });

  const seen = new Map<string, number>();
  patched.forEach((tc, i) => seen.set(tc.id, i));
  return patched.filter((tc, i) => seen.get(tc.id) === i);
}

/** Prefer run metadata tool rows but keep streamed results when metadata omits them. */
export function mergeTerminalToolCalls(
  metadataCalls: ToolCallData[],
  streamedCalls: ToolCallData[],
): ToolCallData[] {
  const base = metadataCalls.length > 0 ? metadataCalls : streamedCalls;
  if (metadataCalls.length === 0) return coalesceDuplicateToolCalls(streamedCalls);
  const streamedById = new Map(streamedCalls.map((tc) => [tc.id, tc]));
  return coalesceDuplicateToolCalls(
    base.map((tc) => {
      const fromStream = streamedById.get(tc.id);
      if (!fromStream) return tc;
      const needsResult = tc.result === undefined && fromStream.result !== undefined;
      const needsStatus =
        (tc.status === 'running' || tc.status === 'pending')
        && (fromStream.status === 'success' || fromStream.status === 'error');
      if (!needsResult && !needsStatus) return tc;
      return {
        ...tc,
        ...(needsResult ? { result: fromStream.result } : {}),
        ...(needsStatus ? { status: fromStream.status, error: fromStream.error } : {}),
      };
    }),
  );
}

/**
 * Merge a streamed tool_result into the live toolCalls list (exact id match, single
 * orphan runner, or several duplicate running rows with the same tool+args).
 * `isError` marks the row as failed (tool threw) instead of succeeded.
 */
export function applyToolResultChunk(
  calls: ToolCallData[],
  toolCallId: string,
  result: unknown,
  isError = false,
): ToolCallData[] {
  if (!calls.length) return calls;
  const tid = String(toolCallId);
  const safeResult = truncateToolResultForRenderer(result);
  const settle = (call: ToolCallData): ToolCallData =>
    isError
      ? {
          ...call,
          status: 'error' as const,
          result: safeResult,
          error: typeof safeResult === 'string' ? safeResult : undefined,
        }
      : { ...call, status: 'success' as const, result: safeResult };
  let matched = false;
  const mapped = calls.map((call) => {
    if (call.id === tid) {
      matched = true;
      return settle(call);
    }
    return call;
  });
  if (matched) return coalesceDuplicateToolCalls(mapped);

  const pendingIdx = mapped
    .map((c, i) => (c.status === 'running' || c.status === 'pending' ? i : -1))
    .filter((i) => i >= 0);
  if (pendingIdx.length === 1) {
    const i = pendingIdx[0]!;
    const next = mapped.slice();
    next[i] = { ...settle(next[i]!), id: tid };
    return coalesceDuplicateToolCalls(next);
  }
  if (pendingIdx.length >= 2) {
    const fp0 = fingerprint(mapped[pendingIdx[0]!]!);
    const allSame = pendingIdx.every((i) => fingerprint(mapped[i]!) === fp0);
    if (allSame) {
      const next = mapped.slice();
      pendingIdx.forEach((i, j) => {
        next[i] = { ...settle(next[i]!), id: j === 0 ? tid : `${tid}_${j}` };
      });
      return coalesceDuplicateToolCalls(next);
    }
  }
  return coalesceDuplicateToolCalls(mapped);
}
