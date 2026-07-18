# GitHub Project Sync

Bidirectional sync between GitHub and Dome for project tracking: milestones,
issues, branches and releases. The Seguimiento tab shows a single non-technical
**dashboard** (objectives + tasks), with dated entities projected onto the Dome
calendar.

Opens as a tab (`TabType 'github'`) from the left sidebar — not a new window.

## Vault scoping

OAuth is global (one GitHub account), but each selected repo is stored in
`github_repos` with a `project_id` (vault). The same `full_name` can be
tracked independently in multiple vaults (`UNIQUE(full_name, project_id)`).
The Seguimiento tab and settings only show repos for the active vault.

## Auth

Device-code OAuth (no backend / no callback), mirroring
`electron/auth/github-copilot-oauth.cjs`.

- `electron/auth/github-oauth.cjs` — `startDeviceFlow()`, `pollForAccessToken()`,
  `getToken()`, `getStatus()`, `disconnect()`.
- Scopes: `repo read:org`. Token stored **encrypted** via
  `core/settings-secrets.cjs` under `github_oauth_token` (auto-encrypted: key
  ends with `_token`).
- Client id: register a GitHub OAuth App with **Device flow** enabled and set
  `DOME_GITHUB_CLIENT_ID`. A placeholder constant is used otherwise.

## Main-process modules (`electron/github/`)

| File | Role |
|------|------|
| `github-api.cjs` | Authenticated REST client (pagination, ETag, rate-limit back-off). Separate from `marketplace/github-client.cjs`. |
| `github-store.cjs` | SQLite data layer for all `github_*` tables (migration 43). |
| `github-sync-service.cjs` | Orchestrates push (dirty → GitHub) then pull (ETag) then calendar bridge. `local-dirty-wins`. |
| `github-sync-scheduler.cjs` | Periodic sync (default 15 min, `github_sync_interval_minutes`). |
| `github-calendar-bridge.cjs` | Projects milestones / dated issues / releases into a dedicated local "GitHub" calendar. |

## Conflict policy

`syncNow()` pushes locally-edited (dirty) rows first, then pulls. A local edit is
therefore written to GitHub and confirmed by the subsequent pull. Single-user
desktop client, no webhooks.

## Calendar mapping

Each vault gets a dedicated local GitHub calendar (`github-default` for the
default vault, `github-{slug}` for others). Mapping is idempotent through
`github_calendar_links` (entity_type + entity_id → event_id), mirroring
`calendar_event_links`. Toggles (default on):
`github_calendar_milestones`, `github_calendar_issues`, `github_calendar_releases`.

- **Milestones** → event on `due_on` (open milestones).
- **Issues** → event on a parsed `due:YYYY-MM-DD` token in the body or a label
  (GitHub issues have no native due date).
- **Releases** → event on `published_at` (skips dates >1y old; calendar rejects them).

## IPC (`electron/ipc/integrations/github.cjs`)

`github:auth:{start,poll,status,disconnect}`,
`github:repos:{list,refresh,setSelected}`,
`github:{milestones,issues,branches,releases}:list`, `github:issues:get`,
`github:issue:{update,move,create}`, `github:milestone:{update,create}`,
`github:sync:now`. Broadcasts: `github:sync:status`, `github:data:updated`.

All channels whitelisted in `electron/preload.cjs` and exposed under
`window.electron.github`.

## Renderer (`app/components/github/`)

`GitHubView` (HubHeader + repo picker + sync + settings) → `GitHubConnect`
(device flow), `TrackingDashboard` (stats, quick-create, filters, objective
sections with local pagination), `IssueDetailPanel` / `MilestoneDetailModal` as
**inline side Card** (master–detail; no Sheet overlay — see
`.claude/sops/inline-detail-surfaces.md`), `GitHubSettings` (repo selection,
disconnect). State in `app/lib/store/useGitHubStore.ts`, IPC wrapper in
`app/lib/github/client.ts`. UI copy uses `github.dash_*` (objective / task
language, not Kanban/Gantt jargon).

## Schema (migration 43)

`github_repos`, `github_milestones`, `github_issues`, `github_branches`,
`github_releases`, `github_sync_state` (per-repo/resource ETags),
`github_calendar_links`. `dirty` + `dome_updated_at` track unpushed local edits.

## Known follow-ups

- IPC channel naming follows the `path.join(':')` convention (e.g.
  `github:issues:listComments`, `github:milestones:create`) so that the dev
  browser IPC shim can resolve channels by the same access path used at
  runtime.
- Brand-new milestones/issues can be created from the dashboard quick-create
  form (optional objective selection or inline objective creation).
