---
title: Simplify AI context management against Pi
status: implemented
---

## Goal and reference
Keep one reliable agent loop and one durable conversation history, preserving
Dome's tools, approvals and UI. Compare against Pi commit
`95fbc04997eaee961eb673fa7923e9220609ebd5` from
https://github.com/earendil-works/pi. Port principles selectively, not its entire
CLI or newer protocol. Work in an isolated checkout to preserve local UI edits.

## Evidence
- Electron's automatic compaction duplicates the harness compaction path. It
  slices messages without tool-result boundary protection, uses captured auth,
  drops cancellation and only changes one provider request. The next turn
  rebuilds the uncompressed persisted history.
- The harness already has durable compaction entries, turn-aware cuts, previous
  summaries, file tracking and fresh request auth. Reuse that implementation.
- The local tool-name sanitizer can turn an aborted/error completion into a
  successful stop while discarding an incomplete tool call.

## Changes and verification
Delete the Electron summarizer and opt Dome into automatic harness compaction.
Share manual and automatic preparation/generation/persistence; propagate abort
through summary generation. Preserve incomplete-stream failure reasons.
Add deterministic regressions for durable compaction, tool boundaries, fresh
auth, cancellation, no repeated summary after reopen, and provider failures.
Run package tests/builds and all repository gates, then PR and squash auto-merge.

## Results
- Removed Electron's duplicate summarizer and its context-hook subscription.
  Dome opts into the harness checkpoint path; other harness consumers retain
  their existing default behavior.
- Automatic and manual compaction share preparation, current auth, cancellation,
  persistence and event reporting. Provider summary failures retain original
  history; cancellation and storage/hook failures are not swallowed.
- Preserved error/aborted stop reasons when removing incomplete tool calls.
- Passed workspace package builds, 80 agent-core tests, 12 runtime/HITL tests,
  461 renderer tests, typecheck, lint (zero errors), guardrails, diff Sonar checks,
  IPC inventory, remote protocol, production build and dependency-cruiser.
- No UI changes, new dependencies or runtime abstractions. No live-provider
  latency benchmark; deterministic tests verify that successful checkpoints
  eliminate repeated summarization after reopening a conversation.
