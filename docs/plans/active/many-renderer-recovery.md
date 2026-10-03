---
title: Recover Many after renderer loss and keep tab surfaces stable
status: implementing
version: 2
base: 9432b4679096fbf40f3a691a19335b24ec48f366
date: 2026-10-03
---

The reported main renderer crash (`crashed`, exit 5) was followed by delivery to a disposed frame. The original crash trigger remains unconfirmed. Six default-GPU macOS cycles with local HTTP pages, a simulated running Many run emitting real `runs:chunk` IPC every 70 ms, browser close/reopen, maximize, resize, background tabs, fullscreen and sidebar navigation produced 68 geometry observations with no spontaneous renderer losses or JS errors. Every renderer viewport matched BrowserWindow content size. Tab reveal opacity still reached zero after activation despite visible native content. A forced termination (`killed`, exit 2 on this host) retained the native sibling view at stale bounds, demonstrating missing ownership cleanup; it did not reproduce a delivery exception.

1. Keep isolated diagnostics in `/tmp/dome-renderer-{repro,induced-crash}.{cjs,json,log}`; profile `native-shell-validation-20261002`. No accounts or provider calls.
2. Track frame availability and recover an unexpectedly lost main renderer once per cooldown. Repeated failure offers a localized native retry action. Cancel recovery on shutdown/close.
3. Centralize safe delivery so disposed recipients cannot interrupt a main run or delivery to healthy windows.
4. Revoke native attachments on host document navigation, renderer loss or close while retaining sessions, partitions, cookies and main runs.
5. Show active tab content immediately, preserving actual loading fallbacks.
6. Restore the active chat's Many session outside render; persistent inactive panes must not choose sessions.
7. Let the shell own desktop-versus-sheet placement and remove the competing absolute aside rule.
8. Add focused renderer/main regression tests and an Electron smoke; wire Linux Xvfb CI. Run all nine repository gates, main syntax, focused tests and four native smokes. Independent review precedes publication.

Scope excludes providers, credentials, DB schema, sync, extension UI and GPU defaults. Preserve first blank commit before CDP, Linux window-backed capture, idempotent native attach and persistent research cookies. Stop for a demonstrated out-of-scope root cause, session/run loss, Linux capture regression or repeated mandatory CI failure. Forced termination proves recovery behavior, not the original trigger.
