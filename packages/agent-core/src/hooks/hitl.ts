/**
 * @dome/agent-core — human-in-the-loop (HITL) approval hook (Tarea 5).
 *
 * The actual approval round-trip lives in `@dome/app`
 * (`electron/ipc/approval.cjs#requestApproval`, which broadcasts
 * `approval:requested` to the renderer and awaits `approval:respond`). This
 * module keeps agent-core decoupled: the app injects a `requestApproval`
 * function and the set (or predicate) of tools that need approval. The hook
 * awaits the decision and blocks the tool when the user declines.
 *
 * Because `requestApproval` resolves only after the user responds (or a
 * timeout), the `beforeToolCall` hook naturally pauses the loop — no separate
 * interrupt/resume token dance is needed in Phase 2 (the legacy approval IPC
 * is already request/response).
 */

import type { AgentHooks, AgentToolCall } from '../types.js';

export interface HitlHookOptions {
  /**
   * Which tools require approval. Either a set of tool names or a predicate.
   * If omitted, no tool requires approval (the hook is a no-op).
   */
  requiresApproval?: Set<string> | ((call: AgentToolCall) => boolean);
  /**
   * Ask the user to approve a tool call. Resolves `true` to allow, `false`
   * to deny (the app maps this to `requestApproval` over IPC). Required when
   * `requiresApproval` matches anything.
   */
  requestApproval: (call: AgentToolCall) => Promise<boolean>;
  /** Message used when the user declines. */
  declineReason?: string;
}

function matches(
  requiresApproval: HitlHookOptions['requiresApproval'],
  call: AgentToolCall,
): boolean {
  if (!requiresApproval) return false;
  if (typeof requiresApproval === 'function') return requiresApproval(call);
  return requiresApproval.has(call.name);
}

/**
 * Build the HITL `beforeToolCall` hook. Returns `null` when no approval is
 * configured (so it can be skipped in composition).
 */
export function createHitlHook(
  opts: HitlHookOptions,
): Pick<AgentHooks, 'beforeToolCall'> | null {
  if (!opts.requiresApproval || typeof opts.requestApproval !== 'function') {
    return null;
  }
  const declineReason = opts.declineReason ?? 'Tool call declined by the user.';
  return {
    async beforeToolCall(ctx) {
      if (!matches(opts.requiresApproval, ctx.call)) return undefined;
      const approved = await opts.requestApproval(ctx.call);
      if (!approved) return { block: true, reason: declineReason };
      return undefined;
    },
  };
}
