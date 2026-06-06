/**
 * @dome/agent-core — guardrails hook (Tarea 5).
 *
 * Port of `electron/guardrails.cjs#detectHarmfulContent`. An optional
 * content-moderation layer that inspects the last user message before the
 * model call and blocks clearly harmful requests. Heuristic only — NOT a
 * security boundary (same disclaimer as the legacy version).
 *
 * Enabled via `DOME_GUARDRAILS=1` (off by default), matching the legacy env
 * flag. `createGuardrailsHook()` returns `null` when disabled so callers can
 * skip it in composition.
 *
 * Shape: a `beforeModelCall` hook (the legacy used LangChain `wrapModelCall`,
 * which is the same boundary — before the model sees the messages).
 */

import type { AgentHooks, AgentMessage, Message } from '../types.js';

/** Heuristics for obviously harmful patterns. Ported 1:1 from guardrails.cjs. */
const HARMFUL_PATTERNS: RegExp[] = [
  /\b(make|create|build|write|generate)\b.{0,40}\b(malware|ransomware|keylogger|trojan|rootkit|spyware|exploit kit)\b/i,
  /\b(step[- ]by[- ]step|instructions?|guide|how to)\b.{0,60}\b(synthesize|produce|manufacture)\b.{0,40}\b(fentanyl|sarin|vx gas|nerve agent|bioweapon|chemical weapon)\b/i,
  /\bgenerate\b.{0,30}\b(csam|child porn|child sexual)\b/i,
];

/** Returns a rejection reason string if content should be blocked, else null. */
export function detectHarmfulContent(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) {
      return 'Request blocked by Dome guardrails.';
    }
  }
  return null;
}

/** Extract the text of the last user message from an AgentMessage[]. */
function lastUserText(messages: AgentMessage[]): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as Message;
    if (!m || m.role !== 'user') continue;
    const c = m.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((b) => {
          if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
            return (b as { text?: string }).text ?? '';
          }
          return '';
        })
        .filter((s) => s.length > 0)
        .join(' ');
    }
  }
  return '';
}

export interface GuardrailsHookOptions {
  /** Force-enable regardless of env (tests). Default: `DOME_GUARDRAILS === '1'`. */
  enabled?: boolean;
}

/**
 * Build the guardrails `beforeModelCall` hook, or `null` when disabled.
 * The returned object has only `beforeModelCall` so it composes cleanly.
 */
export function createGuardrailsHook(
  opts: GuardrailsHookOptions = {},
): Pick<AgentHooks, 'beforeModelCall'> | null {
  const enabled = opts.enabled ?? process.env.DOME_GUARDRAILS === '1';
  if (!enabled) return null;

  return {
    async beforeModelCall(ctx) {
      const reason = detectHarmfulContent(lastUserText(ctx.state.messages));
      if (reason) return { block: true, reason };
      return undefined;
    },
  };
}
