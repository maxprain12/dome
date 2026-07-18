# Dome — Agent Task Protocol

Execution harness for AI agents (Cursor, Claude, Copilot, etc.).

**The only manual step is writing the initial prompt.** Branch → implement → PR → CI → auto-merge. See [docs/principles.md](docs/principles.md) for invariants (P-001…P-010); `pnpm run lint` surfaces renderer rules in the IDE.

---

## Project overview

- **Stack**: Electron 41 + Vite 7 + React 18 + React Router 7 + TypeScript (strict)
- **Renderer** (`app/`): SPA, entry `app/main.tsx`. **No Node.js APIs.**
- **Main** (`electron/`): `better-sqlite3` + `@dome/db` (Drizzle incremental), worker threads for heavy reads/extraction. **IPC** via `electron/preload.cjs` → `window.electron.invoke('channel', args)`.
- **State**: Zustand (`app/lib/store/`), Jotai for local UI
- **Styling**: Tailwind + CSS variables + shadcn/ui (Base UI) — never hardcoded hex in inline styles. Setup: [.claude/sops/shadcn-ui.md](.claude/sops/shadcn-ui.md)
- **i18n**: `app/lib/i18n.ts` — en, es, fr, pt (default `es`)
- **Tabs**: `useTabStore` — not extra Electron windows
- **Embeddings** (main only): `electron/services/embeddings.service.cjs` — LangChain (OpenAI / Google / Ollama); settings `embeddings_*`

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

Obey P-001…P-010. **New IPC** (4 steps or it fails silently): handler `electron/ipc/<group>/<domain>.cjs` (subfolders: core, data, ai, agents, media, learn, sync, integrations) → register in `electron/ipc/index.cjs` with the subfolder path → `ALLOWED_CHANNELS` in `electron/preload.cjs` → renderer `window.electron.invoke('domain:action', args)`.

### Step 3 — Validate locally

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check:ipc-inventory
pnpm run depcruise
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

- **CI** (GitHub Actions, `.github/workflows/ci.yml`): typecheck, lint, build, architecture guard, IPC inventory, dependency-cruiser, asar-unpack check

---

## Where to look


| Need                      | Location                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Principles / P-ids        | [docs/principles.md](docs/principles.md)                                                                          |
| Architecture / IPC list   | [docs/architecture/](docs/architecture/)                                                                          |
| Feature docs              | [docs/features/](docs/features/)                                                                                  |
| Plans                     | [docs/plans/](docs/plans/)                                                                                        |
| Architecture rules (long) | [.claude/rules/architecture-rules.md](.claude/rules/architecture-rules.md)                                        |
| UI components (shadcn)    | [app/components/ui/](app/components/ui/), [.claude/sops/shadcn-ui.md](.claude/sops/shadcn-ui.md)                |
| SOPs                      | [.claude/sops/](.claude/sops/)                                                                                    |
| i18n                      | [app/lib/i18n.ts](app/lib/i18n.ts)                                                                                |
| IPC domain files          | [electron/ipc/](electron/ipc/)                                                                                    |
| Skills                    | `~/.dome/skills/`, `.dome/skills/`, [electron/skills/bundled/](electron/skills/bundled/) — [CLAUDE.md](CLAUDE.md) |
| Database / Drizzle        | [docs/features/database.md](docs/features/database.md), [.claude/sops/drizzle-domain-migration.md](.claude/sops/drizzle-domain-migration.md) |
