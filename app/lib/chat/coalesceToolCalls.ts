import type { ToolCallData } from '@/components/chat/ChatToolCard';

function stableArgsKey(args: Record<string, unknown>): string {
  try {
    const raw = args || {};
    const keys = Object.keys(raw).sort();
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

  return calls.map((tc) => {
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
}

/**
 * Merge a streamed tool_result into the live toolCalls list (exact id match, single
 * orphan runner, or several duplicate running rows with the same tool+args).
 */
export function applyToolResultChunk(
  calls: ToolCallData[],
  toolCallId: string,
  result: unknown,
): ToolCallData[] {
  if (!calls.length) return calls;
  const tid = String(toolCallId);
  let matched = false;
  const mapped = calls.map((call) => {
    if (call.id === tid) {
      matched = true;
      return { ...call, status: 'success' as const, result };
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
    next[i] = { ...next[i]!, id: tid, status: 'success' as const, result };
    return coalesceDuplicateToolCalls(next);
  }
  if (pendingIdx.length >= 2) {
    const fp0 = fingerprint(mapped[pendingIdx[0]!]!);
    const allSame = pendingIdx.every((i) => fingerprint(mapped[i]!) === fp0);
    if (allSame) {
      const next = mapped.slice();
      for (const i of pendingIdx) {
        next[i] = { ...next[i]!, id: tid, status: 'success' as const, result };
      }
      return coalesceDuplicateToolCalls(next);
    }
  }
  return coalesceDuplicateToolCalls(mapped);
}
