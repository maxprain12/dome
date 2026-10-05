# Manys and OpenDots: how the agent is shown, controlled and permitted

[OpenDots](https://github.com/CopilotKit/OpenDots) is the reference for how a person works with
always-on agents that have their own computer. This is how each of its ideas exists in Dome
(`app/components/manys`, `electron/ipc/agents`) and dome-provider (`lib/manys`), and where Dome
differs on purpose because it runs for many users at once.

## Talking to an agent

| OpenDots | Manys |
| --- | --- |
| A run streams AG-UI events (text deltas, tool calls) over HTTP | The worker writes `run_text` and `task_step` events; the provider serves them as SSE from a Postgres cursor; the main process relays them (`manys:events:*`) and `liveRuns.ts` folds them into a turn |
| Text appears as it is written | Same, as short windows of text (`run-stream.ts`): bounded writes, best effort, deleted when the task finishes because the saved message is the record |
| Reconnect and keep the conversation | The feed resumes from the last event delivered; the first connection starts from now (`after=latest`) |
| Stop the response | Cancel the task; its lease is fenced so a late result is discarded |
| A tool call renders as a card in the thread, the latest browser call shows a live view | `ManyToolCard` per call (paired by call id), the latest computer call embeds a read-only live view |
| Human-in-the-loop review card | `ManyActionCard` in the thread at the point of `propose_action`, bound to the digest it was shown |

Differences: OpenDots is one process with SQLite. Here events are durable per tenant (RLS), any
worker replica can run a turn, and the feed is a cursor so a slow or reconnecting client loses
nothing. Event data never carries arguments, content or credentials.

## Seeing and controlling the computer

| OpenDots | Manys |
| --- | --- |
| Browser, Files, Terminal, Activity tabs | `ManyComputer`: the whole desktop first, then terminal, files, browser and activity |
| Live screen, click, type, keys | The computer's sockets: the whole Linux desktop over VNC (noVNC in the renderer, bytes relayed by the main process, which holds the session token) and the browser's own screencast for the inline preview and the Browser tab |
| Terminal: one bounded command | A real PTY (bash) per Many with scrollback, resize and Ctrl+C, only while the person holds the wheel |
| Take over / return control | Same, plus a fresh snapshot is required before the agent continues |
| Agent tools | One tool per action, used directly under the owner's switches |
| Start / stop computer | Status, start and stop; stopping keeps files and the browser profile |

The desktop is a shared machine: the Many works on it, and the person sees and, holding the wheel,
drives the same Chromium, terminal, files and any app. Opened without the wheel the socket is view
only (the computer filters the VNC client's messages) and it is reopened when the wheel changes
hands. It sits behind the shell permission because it is the whole machine.

## Permissions

| OpenDots | Manys |
| --- | --- |
| Enabled / browser / files / shell per Dot | `grants.computer {browser, files, shell}` plus the `computer.read` and `computer.write` capabilities |
| Applies to the agent and the owner | One map (`operationKind`) is checked for the agent's reads, approved actions at execution time, the person's operations, and the screen and terminal sockets |
| Revoking aborts in-flight calls within ~100 ms | Changing grants fences running work in the database (lease fence, dispatched actions become `outcome_unknown`) so it holds across replicas, with no in-process watcher |
| Global pause | Per-Many pause (`grants.paused`) and a pause-all from the overview; a paused Many takes no new work and queued work is paused instead of run |
| Audit with actor | Append-only audit of every governed call, plus `computer_activity` events for what the person did |

The agent uses its computer the way OpenDots' does: one tool per action (`computer_navigate`,
`computer_snapshot`, `computer_click`, `computer_type`, files, `computer_exec`), and with the
owner's switches on it simply acts, in one run, with no proposal and no approval per action. Every
call re-reads the owner's switches and a pause, stops while the person holds the wheel, is fenced by
the lease, goes through the policy rules (hosts, operations) and is audited. Results are clipped to
the model's budget. Differences from OpenDots on purpose: the computer runs under gVisor with an
egress filter, and what should not happen without an explicit okay (sending, publishing, buying,
deleting outside Dome) is asked of the person by the agent (`ask_user`, or `propose_action` for an
exact action to review). That last part is an instruction to the agent, as in OpenDots, not a
technical block. Saved credentials are typed only through a reviewed proposal; otherwise the person
takes the wheel and signs in, and the profile keeps the session.

## Not covered yet

- Voice calls and Slack: both need provider credentials (a realtime speech provider, a Slack app).
- Learned skills delivery.
- Spaces and the page editor: Dome's library and notes play that role.
