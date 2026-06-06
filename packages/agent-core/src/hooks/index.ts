/**
 * @dome/agent-core — hook composition (Tarea 5).
 *
 * `composeHooks` merges multiple `AgentHooks` into one the loop can consume.
 * `buildDefaultHooks` assembles the standard Dome stack (guardrails → caps →
 * HITL) for a given profile, paralleling the legacy middleware stack built in
 * `langgraph-agent.cjs` / `agent-middleware.cjs`.
 *
 * Composition semantics:
 *   - `beforeModelCall` / `beforeToolCall`: run in order; the FIRST hook that
 *     returns `{ block: true }` wins and short-circuits the rest.
 *   - `afterToolCall`: run in order; patches merge (later overrides earlier);
 *     `terminate` is OR-ed across all hooks.
 *   - `shouldStopAfterTurn`: OR across all hooks (any `true` stops the loop).
 */

import type { AgentHooks, AgentToolResult } from '../types.js';
import { createGuardrailsHook } from './guardrails.js';
import { createCapsHook } from './caps.js';
import { createHitlHook, type HitlHookOptions } from './hitl.js';

export { detectHarmfulContent, createGuardrailsHook } from './guardrails.js';
export { CREATION_TOOL_CAPS, countToolCalls, createCapsHook } from './caps.js';
export { createHitlHook } from './hitl.js';
export type { HitlHookOptions } from './hitl.js';

/** Merge several partial hook objects into a single `AgentHooks`. */
export function composeHooks(...hooks: Array<AgentHooks | null | undefined>): AgentHooks {
  const list = hooks.filter((h): h is AgentHooks => !!h);

  return {
    async beforeModelCall(ctx) {
      for (const h of list) {
        if (!h.beforeModelCall) continue;
        const r = await h.beforeModelCall(ctx);
        if (r && r.block) return r;
      }
      return undefined;
    },
    async beforeToolCall(ctx) {
      for (const h of list) {
        if (!h.beforeToolCall) continue;
        const r = await h.beforeToolCall(ctx);
        if (r && r.block) return r;
      }
      return undefined;
    },
    async afterToolCall(ctx) {
      let merged: (Partial<AgentToolResult> & { terminate?: boolean }) | undefined;
      for (const h of list) {
        if (!h.afterToolCall) continue;
        const r = await h.afterToolCall(ctx);
        if (r) {
          merged = { ...(merged ?? {}), ...r };
          // terminate is sticky once any hook asks for it.
          if (r.terminate) merged.terminate = true;
        }
      }
      return merged;
    },
    shouldStopAfterTurn(ctx) {
      for (const h of list) {
        if (h.shouldStopAfterTurn?.(ctx)) return true;
      }
      return false;
    },
  };
}

/** Agent profile — `full` is the interactive Many agent; `worker` a sub-agent. */
export type AgentProfile = 'full' | 'worker';

export interface BuildDefaultHooksOptions {
  profile?: AgentProfile;
  /** Override the creation-tool caps (merged over the defaults). */
  caps?: Record<string, number>;
  /** Enable guardrails regardless of env (tests). Default: `DOME_GUARDRAILS`. */
  guardrails?: boolean;
  /** HITL approval config. Omit to disable approval prompts. */
  hitl?: HitlHookOptions;
}

/**
 * Assemble the standard Dome hook stack: guardrails (content moderation) →
 * caps (creation/mutation limits) → HITL (approval). Any layer that is
 * disabled is skipped. Returns a single composed `AgentHooks`.
 */
export function buildDefaultHooks(opts: BuildDefaultHooksOptions = {}): AgentHooks {
  const layers: Array<AgentHooks | null> = [
    createGuardrailsHook({ enabled: opts.guardrails }),
    createCapsHook(opts.caps),
    opts.hitl ? createHitlHook(opts.hitl) : null,
  ];
  return composeHooks(...layers);
}
