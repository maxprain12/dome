---
title: Remote Many connectivity and latency
status: implemented
---

## Evidence and scope
- Companion waits up to 24 hours on a silent SSE connection, marks it live before HTTP success, polls in parallel with SSE and delays command completion with five extra reads.
- Provider allows overlapping cursor reads, leaks timers on stream cancellation and filters recipients/expiry after limiting replay pages.
- Desktop start is not idempotent, connections have no idle deadline, text batching resets its timer with every token and OAuth refresh paths race a single-use refresh token.

## Changes
Keep encrypted SSE and the existing replay protocol. Remove duplicate polling and heartbeat work; serialize Provider reads; bound silent connections and text latency; share token refresh and ensure a single Desktop listener. Preserve unrelated work in isolated worktrees.

## Validation and delivery
Reproduce concurrent reads, cancellation, recipient starvation, text batching and refresh races with deterministic tests. Run each repository's required checks and iOS simulator tests. Open PRs and enable auto-merge; no production performance claim without measurement on deployed builds.

## First-principles review
The goal is one authenticated, encrypted command/event channel that reconnects
without losing its session or adding waits to commands. Keep SSE and durable
replay: replacing the transport or adding Redis would not fix the observed client
races. Delete Companion's duplicate heartbeat loop and post-command polling.
Keep Provider's cross-process fallback poll and Companion's disconnected fallback.
No wire contract or database migration is required; each repository can ship independently.

## Results
- Dome: typecheck, lint, 461 renderer tests, guardrails, Sonar diff checks, IPC inventory, protocol check, production build and dependency-cruiser passed. All 171 security tests and 25 focused remote tests passed (overlapping sets).
- Provider: typecheck, lint, 101 tests, guardrails, protocol check and production build passed. New tests cover overlapping pulls, cancellation and replay starvation.
- Companion: guardrails, protocol check and all 13 simulator tests passed. The new transport test covers repeated start, one heartbeat, stream idle deadline and absence of polling while SSE is live.
- The 1,470 ms of explicit post-command sleeps and five redundant reads were removed; text batches flush 220 ms after their first fragment; silent connections time out after 35 seconds; Desktop announces presence immediately on connection.
- These are code/test observations, not an end-to-end production latency benchmark. Physical-device sleep/wake, Wi-Fi/cellular transitions and deployed proxy behavior still need validation after release.
