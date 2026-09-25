# Dome — Agent Task Protocol

Execution harness for AI agents (Cursor, Claude, Copilot, etc.).

**The only manual step is writing the initial prompt.** Branch → implement → PR → CI → auto-merge. See [docs/principles.md](docs/principles.md) for invariants (P-001…P-011); `pnpm run lint` surfaces renderer rules in the IDE. Guardrails UI: [docs/guardrails/README.md](docs/guardrails/README.md).

---

## Project overview

- **Stack**: Electron 41 + Vite 7 + React 18 + React Router 7 + TypeScript (strict)
- **Renderer** (`app/`): SPA, entry `app/main.tsx`. **No Node.js APIs.**
- **Main** (`electron/`): `better-sqlite3` + `@dome/db` (Drizzle incremental), worker threads for heavy reads/extraction. **IPC** via `electron/preload.cjs` → `window.electron.invoke('channel', args)`.
- **State**: Zustand (`app/lib/store/`), Jotai for local UI
- **Styling**: Tailwind + CSS variables + shadcn/ui (Base UI) — never hardcoded hex in inline styles. Setup: [.claude/sops/shadcn-ui.md](.claude/sops/shadcn-ui.md)
- **i18n**: `packages/i18n/locales/{en,es,fr,pt}/` (react-i18next; `app/lib/i18n.ts` only bootstraps)
- **Tabs**: `useTabStore` — not extra Electron windows
- **Embeddings** (main only): `electron/services/embeddings.service.cjs` — LangChain (OpenAI / Google / Ollama); settings `embeddings_*`

Full rules: [docs/principles.md](docs/principles.md) · Architecture: [docs/architecture/README.md](docs/architecture/README.md) · New IPC: [.claude/sops/new-ipc-channel.md](.claude/sops/new-ipc-channel.md) · Sonar patterns (P-011): [docs/automation/sonar-clean-code.md](docs/automation/sonar-clean-code.md)

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

Obey P-001…P-011. **New IPC** (4 steps or it fails silently): handler `electron/ipc/<group>/<domain>.cjs` (subfolders: core, data, ai, agents, media, learn, sync, integrations) → register in `electron/ipc/index.cjs` with the subfolder path → `ALLOWED_CHANNELS` in `electron/preload.cjs` → renderer `window.electron.invoke('domain:action', args)`.

### Step 3 — Validate locally

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:ui
pnpm run check:guardrails
pnpm run check:sonar-patterns -- --diff=origin/main
pnpm run check:ipc-inventory
pnpm run check:remote-protocol
pnpm run build
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

- **CI** (Woodpecker, `.woodpecker/ci.yaml`): typecheck, lint, build, architecture guard, IPC inventory, dependency-cruiser, asar-unpack check

---

## Cutting a release

Woodpecker does not build installers. Each operating system publishes its own files. `main` is protected, so the version bump goes through a pull request. Do not run `pnpm run release` until the tag `vX.Y.Z` exists on `origin`.

Every machine uses the same `.env.release.local` (copy of `.env.release.example`): staging keys for `https://s3.dowi.es` bucket `dome-releases-staging`, and the public R2 keys for `https://dl.dowi.es`. macOS also needs a **Developer ID Application** certificate (team `8AFY6A6T37`) plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Windows needs `CSC_LINK` and `CSC_KEY_PASSWORD`. Linux x64 needs `flatpak-builder` and the 24.08 runtimes (`Platform`, `Sdk`, `Electron2.BaseApp`).

1. From `main`, branch, set `package.json` `"version"` to `X.Y.Z`, and replace `## [Unreleased]` in `CHANGELOG.md` with `## [X.Y.Z](https://dome.dowi.es/changelog#vX.Y.Z) - YYYY-MM-DD`. Open a PR, wait for Woodpecker, and squash-merge. Do not push that commit straight to `main`.
2. After the merge is on `origin/main`:

```bash
git checkout main && git pull --ff-only
git tag vX.Y.Z
git push origin vX.Y.Z
```

`git fetch --tags` stops if a local tag points at a different commit than GitHub (`would clobber existing tag`). Point that one local tag at the remote tag. Do not force-push tags.

3. On each machine, for that same tag:

```bash
git fetch origin tag vX.Y.Z
git checkout vX.Y.Z
pnpm run release -- --github-bridge
```

The command builds only the current OS and publishes it to `https://dl.dowi.es`. `--github-bridge` creates the GitHub release or, if another machine already created it, uploads this OS's files next to the ones already there. Installs older than 2.9.0 still update from GitHub; this bridge is what points them at `https://dl.dowi.es/feed`.

For 2.9.0 on Windows and Linux, after this Mac has pushed the tag:

```bash
git fetch origin tag v2.9.0
git checkout v2.9.0
pnpm run release -- --github-bridge
```

4. A bad release: `pnpm run release:promote -- --channel latest --pause`, then ship a patch. The updater does not downgrade.

The browser extension and the iOS app ship through their stores, on their own cadence:

- Browser extension (Chrome Web Store, Edge Add-ons, Safari): [.claude/sops/release-browser-extension.md](.claude/sops/release-browser-extension.md)
- Dome Companion (TestFlight, App Store): [dome-companion/docs/release.md](https://github.com/maxprain12/dome-companion/blob/main/docs/release.md)

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
