/**
 * @dome/agent-core — trimming compaction engine (Tarea 3).
 *
 * Port 1:1 of `createTrimmingMiddleware` from
 * `electron/agent-middleware.cjs` (lines 290-388), re-shaped onto the
 * `CompactionEngine` interface declared in `types.ts`. The legacy
 * middleware used LangChain's `trimMessages` helper to enforce a
 * `maxTokens` budget; this implementation drops the dependency and
 * uses the simple "preserve system + last N turns" strategy specified
 * in `phase-2-dome-agent-core.PLAN.md` section 3 (Tarea 3).
 *
 * Strategy:
 *   - `needs(state)` — true when the approximate token count of
 *     `state.systemPrompt` + `state.messages` exceeds
 *     `settings.thresholdTokens` (default 100_000). Cheap char/4
 *     estimate, no LLM call.
 *   - `compact(state)` — returns a **new** `AgentState`. The system
 *     message (first one in `state.messages`, if any) is preserved;
 *     the most recent `settings.maxRetainedTurns` turns are kept;
 *     any vision-bearing message older than the retained window is
 *     preserved if `settings.preserveVision` is true. Tool results
 *     attached to a retained assistant turn are never split off.
 *
 * Why no LLM summarization? Phase 2 ships the cheapest possible
 * compaction (R4) and a future iteration can layer summarization
 * on top. See `phase-2-dome-agent-core.PLAN.md` section 1 item 4.
 */

import type {
  AgentMessage,
  AgentState,
  CompactionEngine,
  CompactionSettings,
  LegacyAgentMessage,
  Message,
} from '../types.js';
import { isLegacyAssistantMessage, isPiAssistantMessage } from '../runtime/message-utils.js';

// =============================================================================
// Token estimation (shared with budget telemetry)
// =============================================================================

/**
 * Approximate a token count from a string using the legacy char/4 rule
 * (`electron/prompt-budget.cjs#approxTokens`). Returns `0` for empty or
 * non-string input, and at least `1` for any non-empty string — matching
 * the legacy semantics so the budget event keeps a consistent shape.
 *
 * The `Math.ceil` matches `prompt-budget.cjs` and the test fixture
 * (`'hello world' = 11 chars / 4 = 2.75 → 3`).
 */
export function estimateTokens(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  if (text.length <= 0) return 0;
  // The legacy uses `Math.max(1, Math.ceil(charCount / 4))` — replicate
  // the lower bound so a single character is still "1 token".
  if (text.length < 4) return 1;
  return Math.ceil(text.length / 4);
}

// =============================================================================
// Message inspection
// =============================================================================

/**
 * Extract a text string from a `Message.content` field that can be
 * `string | unknown[]`. Mirrors `getTextContent` in the legacy
 * middleware: arrays of `{ text }` blocks are concatenated with
 * `\n`; everything else is JSON-stringified.
 */
function messageText(msg: AgentMessage): string {
  if (isLegacyAssistantMessage(msg)) {
    return typeof msg.text === 'string' ? msg.text : '';
  }
  if (isPiAssistantMessage(msg)) {
    return msg.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
  const content = (msg as Message).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as { type?: unknown; text?: unknown };
          if (typeof b.text === 'string') return b.text;
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
  }
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

/**
 * Cheap, runtime-narrowing check for the assistant variant of
 * `AgentMessage`. `AssistantMessage` is discriminated by the `text`
 * field at runtime (it does not carry a `role`/`content` shape).
 */
function isAssistantMessage(msg: AgentMessage): msg is LegacyAgentMessage | import('@dome/ai').AssistantMessage {
  return isLegacyAssistantMessage(msg) || isPiAssistantMessage(msg);
}

function isSystemMessage(msg: AgentMessage): boolean {
  if (isAssistantMessage(msg)) return false;
  return (msg as { role?: string }).role === 'system';
}

function isUserMessage(msg: AgentMessage): boolean {
  if (isAssistantMessage(msg)) return false;
  return (msg as Message).role === 'user';
}

function isToolMessage(msg: AgentMessage): boolean {
  if (isAssistantMessage(msg)) return false;
  const role = (msg as { role?: string }).role;
  return role === 'tool' || role === 'toolResult';
}

/**
 * Detect a "vision-bearing" message — one whose `content` array
 * contains an image block, or whose `attachments.images` is set.
 * Mirrors `findLatestVisionMessageIndex` from the legacy middleware.
 */
function isVisionMessage(msg: AgentMessage): boolean {
  if (isAssistantMessage(msg)) return false; // assistant text is never a vision payload
  const m = msg as Message & { attachments?: { images?: unknown[] } };
  // Inline content blocks (OpenAI / Anthropic multimodal shape).
  if (Array.isArray(m.content)) {
    for (const block of m.content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { type?: unknown };
      if (b.type === 'image' || b.type === 'image_url') return true;
    }
  }
  // External attachments (the alternative shape exposed by `UserInput`).
  const imgs = m.attachments?.images;
  if (Array.isArray(imgs) && imgs.length > 0) return true;
  return false;
}

// =============================================================================
// Turn segmentation
// =============================================================================

/**
 * A "turn" for trimming purposes = one user message + the assistant
 * response that follows + any tool results emitted by that assistant.
 * The legacy LangChain `trimMessages` did the same: `startOn: 'human'`,
 * `endOn: ['human', 'tool']`. We replicate the segmentation here so
 * trimming always lands on a user/tool boundary — never in the middle
 * of an assistant → tool_results chain.
 */
interface Turn {
  /** The first user message that opens the turn (undefined for an "open" turn). */
  userIndex: number;
  /** All message indices that belong to this turn (user + assistant + tool results). */
  indices: number[];
}

function segmentTurns(messages: AgentMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!msg) continue;

    if (isUserMessage(msg)) {
      // A new user message starts a new turn. If the previous turn
      // had no user (an "open" turn at the start of the history), we
      // keep it as a standalone turn so we never lose context.
      if (current) {
        turns.push(current);
      }
      current = { userIndex: i, indices: [i] };
    } else if (isToolMessage(msg)) {
      // Tool results attach to the most recent assistant turn. If
      // there is no current turn, create a synthetic one so the tool
      // message is preserved.
      if (!current) {
        current = { userIndex: -1, indices: [] };
      }
      current.indices.push(i);
    } else if (isAssistantMessage(msg)) {
      // Assistant message attaches to the current turn (or opens one
      // if there is no user message yet — a "preamble" turn).
      if (!current) {
        current = { userIndex: -1, indices: [] };
      }
      current.indices.push(i);
    } else if (isSystemMessage(msg)) {
      // System messages are handled separately by the caller; they
      // are not part of the turn stream. We skip them here so they do
      // not break segmentation. The caller (`compact`) will splice
      // the first system message back in.
    }
  }

  if (current) {
    turns.push(current);
  }
  return turns;
}

// =============================================================================
// Public engine
// =============================================================================

/**
 * Build a `CompactionEngine` with the given settings.
 *
 * @param settings - `thresholdTokens` (default 100_000), `maxRetainedTurns`
 *   (default 10), `preserveVision` (default true). Values are NOT
 *   defaulted here — pass them in via `createDefaultCompaction` or
 *   your own factory.
 */
export function createTrimmingEngine(settings: CompactionSettings): CompactionEngine {
  return {
    needs(state) {
      const totalChars =
        (state.systemPrompt?.length ?? 0) +
        state.messages.reduce((sum, m) => sum + messageText(m).length, 0);
      return estimateTokens(' '.repeat(totalChars)) > settings.thresholdTokens;
    },

    async compact(state) {
      const messages = state.messages;
      if (messages.length === 0) {
        // Nothing to trim — return a structural copy.
        return cloneState(state, messages);
      }

      // 1. Peel off the first system message (legacy behavior: only
      //    the first system is kept verbatim).
      let sysMsg: AgentMessage | null = null;
      let work = messages;
      if (isSystemMessage(messages[0]!)) {
        sysMsg = messages[0]!;
        work = messages.slice(1);
      }

      // 2. If everything else is gone, return [system?] only.
      if (work.length === 0) {
        return cloneState(state, sysMsg ? [sysMsg] : []);
      }

      // 3. Segment into turns. We work on the *index within `work`*,
      //    then translate back to the original `messages` indices.
      const turns = segmentTurns(work);
      if (turns.length <= settings.maxRetainedTurns) {
        // Already small enough — but if `needs()` is still true (rare
        // single-turn-overload case), we still respect the cap. Otherwise
        // we keep everything.
        if (sysMsg) {
          return cloneState(state, [sysMsg, ...work]);
        }
        return cloneState(state, work);
      }

      // 4. Keep the last `maxRetainedTurns` turns. Each turn is kept
      //    intact (user + assistant + tool_results) so we never split
      //    a tool result away from its assistant turn.
      const retainedTurns = turns.slice(turns.length - settings.maxRetainedTurns);
      const retainedSet = new Set<number>();
      for (const t of retainedTurns) {
        for (const idx of t.indices) {
          retainedSet.add(idx);
        }
      }

      // 5. Vision preservation. If enabled, walk older messages
      //    (those we are about to drop) for the latest vision-bearing
      //    one and force it into the retained set. Mirrors the legacy
      //    `findLatestVisionMessageIndex` behavior.
      if (settings.preserveVision) {
        const lastVisionIdx = findLatestVisionIndex(work);
        if (lastVisionIdx >= 0 && !retainedSet.has(lastVisionIdx)) {
          retainedSet.add(lastVisionIdx);
        }
      }

      // 6. Rebuild the message list in the original order. System
      //    message goes first (per legacy convention), then the
      //    retained indices sorted ascending.
      const retainedIndices = Array.from(retainedSet).sort((a, b) => a - b);
      const retainedMessages: AgentMessage[] = [];
      if (sysMsg) retainedMessages.push(sysMsg);
      for (const i of retainedIndices) {
        const m = work[i];
        if (m) retainedMessages.push(m);
      }

      return cloneState(state, retainedMessages);
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** Walk a message list backward and return the latest vision-bearing index, or -1. */
function findLatestVisionIndex(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && isVisionMessage(m)) return i;
  }
  return -1;
}

/**
 * Build a new `AgentState` with the given message list. Everything
 * else (systemPrompt, model, thinkingLevel, tools) is shallow-copied
 * from the input so the caller cannot accidentally mutate it.
 */
function cloneState(state: AgentState, messages: AgentMessage[]): AgentState {
  return {
    systemPrompt: state.systemPrompt,
    model: state.model,
    thinkingLevel: state.thinkingLevel,
    tools: state.tools,
    messages,
  };
}
