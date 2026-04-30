# Dome — Agent Task Protocol

Execution harness for AI agents (Cursor, Claude, Copilot, etc.).

**The only manual step is writing the initial prompt.** Branch → implement → PR → CI → (VPS) AI review → auto-merge. See [docs/principles.md](docs/principles.md) for invariants (P-001…P-010); `npm run lint` surfaces renderer rules in the IDE.

---

## Project overview

- **Stack**: Electron 41 + Vite 7 + React 18 + React Router 7 + TypeScript (strict)
- **Renderer** (`app/`): SPA, entry `app/main.tsx`. **No Node.js APIs.**
- **Main** (`electron/`): `better-sqlite3`, full OS. **IPC** via `electron/preload.cjs` → `window.electron.invoke('channel', args)`.
- **State**: Zustand (`app/lib/store/`), Jotai for local UI
- **Styling**: Tailwind + CSS variables — never hardcoded hex in inline styles
- **i18n**: `app/lib/i18n.ts` — en, es, fr, pt (default `es`)
- **Tabs**: `useTabStore` — not extra Electron windows
- **Nomic / embeddings** (main only): `electron/services/embeddings.service.cjs` — `search_document:` / `search_query:`

Full rules: [docs/principles.md](docs/principles.md) · Architecture: [docs/architecture/README.md](docs/architecture/README.md) · New IPC: [.claude/sops/new-ipc-channel.md](.claude/sops/new-ipc-channel.md)

---

## Execution protocol

### Step 0 — Classify


| Type             | Branch prefix |
| ---------------- | ------------- |
| feature          | `feat/`       |
| fix              | `fix/`        |
| refactor         | `refactor/`   |
| docs/config only | `docs/`       |


### Step 1 — Branch

```bash
git checkout main && git pull
git checkout -b feat/<short-description>
```

### Step 2 — Implement

Obey P-001…P-010. **New IPC** (4 steps or it fails silently): handler `electron/ipc/<domain>.cjs` → register `electron/ipc/index.cjs` → `ALLOWED_CHANNELS` in `electron/preload.cjs` → renderer `window.electron.invoke('domain:action', args)`.

### Step 3 — Validate locally

```bash
npm run typecheck
npm run lint
npm run build
npm run check:ipc-inventory
npm run depcruise
```

### Step 4 — Open PR (example)

```bash
gh pr create --title "feat: …" --body "…"
```

### Step 5 — Auto-merge

```bash
gh pr merge --auto --squash
```

### Step 6 — Done

- **CI** (GitHub): typecheck, lint, build, architecture guard, IPC inventory, dependency-cruiser
- **AI code review (VPS)**: *not* `.github/workflows/ai-review.yml` — see [docs/architecture/decisions/0001-ai-review-on-vps.md](docs/architecture/decisions/0001-ai-review-on-vps.md)
  - **Cron** `scripts/vps-pr-review.sh` (e.g. :23/:53) for open PRs; dedupe per PR SHA
  - **Inline** in `scripts/vps-audit.sh` before `gh pr merge --auto` for audit PRs
- Dashboard (operator): e.g. `/var/www/dome-audit/index.html` on the audit host

---

## Prompts (versioned)


| What                 | Where                                                             |
| -------------------- | ----------------------------------------------------------------- |
| AI review (3 passes) | `prompts/review/*.md` + `scripts/ai-review.mjs`                   |
| VPS audits           | `prompts/audits/<focus>.md` + `prompts/shared/project-context.md` |
| Version bump         | Change `version:` in frontmatter when prompt semantics change     |


---

## Where to look


| Need                      | Location                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Principles / P-ids        | [docs/principles.md](docs/principles.md)                                                                          |
| Architecture / IPC list   | [docs/architecture/](docs/architecture/)                                                                          |
| Feature docs              | [docs/features/](docs/features/)                                                                                  |
| Plans                     | [docs/plans/](docs/plans/)                                                                                        |
| Architecture rules (long) | [.claude/rules/architecture-rules.md](.claude/rules/architecture-rules.md)                                        |
| SOPs                      | [.claude/sops/](.claude/sops/)                                                                                    |
| i18n                      | [app/lib/i18n.ts](app/lib/i18n.ts)                                                                                |
| IPC domain files          | [electron/ipc/](electron/ipc/)                                                                                    |
| Skills                    | `~/.dome/skills/`, `.dome/skills/`, [electron/skills/bundled/](electron/skills/bundled/) — [CLAUDE.md](CLAUDE.md) |
| Audit milestones          | [scripts/audit-milestones.json](scripts/audit-milestones.json)                                                    |
| VPS setup                 | [docs/vps-audit-setup.md](docs/vps-audit-setup.md)                                                                |
