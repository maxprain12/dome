# agent-core upstream

Dome's agent runtime is a vendored and extended copy of pi's `packages/agent`.

| Part | Source |
|---|---|
| Loop, `Agent`, types, proxy, stream-fn (`src/*.ts`) | pi `56b25ff4e` (pi-agent-core 1.0.4, 2026-10-06). Previously `ae9450dc5` (2026-05-20). |
| Harness (`src/harness/**`) | pi `b63d26332` (2026-05-28), refactored by Dome. pi deleted its harness on 2026-10-01 (`7fd478a2e`); `coding-agent/src/core` is the living upstream for the ideas. |

## Dome adaptations

- **System prompt and tools, two modes.** pi carries them inside the transcript (`declareToolChanges`); Dome's other surfaces keep `AgentContext.systemPrompt` and fold it and the tools into the leading system message of every request. The loop supports both: `AgentLoopConfig.transcriptSystem` selects pi's form, and `AgentHarnessOptions.transcriptSystem` records the prompt and tools once in a new session (a session that already has messages and no leading system message keeps the old way; compaction puts the system messages back in front). Manys use the transcript form; the Electron agents have not moved yet because it changes their JSONL sessions. pi's Agent and loop suites run in transcript mode with nothing skipped.
- **MiniMax tool calls.** Calls with an empty name are dropped (`sanitizeAssistantToolCalls`) and the stop reason is fixed up.
- **Interrupts.** `isAgentInterrupt` errors thrown by a tool (human-in-the-loop approval) abort the loop instead of becoming an error result.
- **`shouldStopAfterTurn`.** pi removed it; the harness keeps the option and adapts it to `finishTurn` (skipped for error/aborted turns).
- **Default stream function.** Falls back to `streamSimple` from `@dome/ai` instead of throwing.

## Context management (Dome additions, not in pi's agent package)

- `estimateContextTokens(messages, overhead?)` follows pi's rules (usage that predates a newer prefix message is discarded, zero-usage responses are ignored) and counts the system prompt and tool declarations when no usage exists yet.
- Summarization retries transient provider errors, never stores a summary cut off at the output limit, and runs split-turn summaries one after the other.
- With `autoCompaction`, a provider rejection for context size compacts the session and retries the request once (`harness/utils/overflow-recovery.ts`).

- **Compaction budget.** `AgentHarnessOptions.compaction` (`thresholdTokens`, `keepRecentTokens`, `reserveTokens`) lets a host with a request budget smaller than the model window compact earlier; Manys summarize in the `session_before_compact` hook so the summary is reserved and settled like any model call.

## Tests

`test/pi-agent-loop.test.ts` and `test/pi-agent.test.ts` are pi's suites with imports rewritten.
