# Dome — Agent Task Protocol

This file is the **execution harness** for AI agents working on this codebase.
It applies to Claude Code, Cursor, Windsurf, GitHub Copilot, or any AI coding tool.

**The only manual step is writing the initial prompt.**
Everything else — branch, implementation, PR, CI, review, merge, flag activation — is automated.
Execute the steps below in order. Do not stop between steps unless you hit an irreversible decision.

---

## Project overview (read before coding)

- **Stack**: Electron 32 + Vite 7 + React 18 + React Router 7 + TypeScript (strict)
- **Renderer** (`app/`): Vite + React SPA. Entry: `app/main.tsx`. **No Node.js APIs.**
- **Main process** (`electron/`): Node.js. SQLite via `better-sqlite3`. Full OS access.
- **IPC bridge** (`electron/preload.cjs`): `contextBridge` exposes `window.electron` to renderer.
- **State**: Zustand stores in `app/lib/store/`, Jotai atoms for local UI state.
- **Styling**: Tailwind (layout) + CSS variables (colors). Never hardcode hex values.
- **i18n**: `app/lib/i18n.ts`, 4 languages: **en, es, fr, pt**. Default: `es`.
- **Tabs**: all major views open as tabs via `useTabStore`, not new Electron windows.

---

## Execution protocol

### Step 0 — Classify the task


| Task type   | Signal words                     | Branch prefix | Flag needed?          |
| ----------- | -------------------------------- | ------------- | --------------------- |
| New feature | add, implement, create, build    | `feat/`       | Yes (if user-visible) |
| Bug fix     | fix, broken, error, crash, wrong | `fix/`        | No                    |
| Refactor    | rename, move, extract, clean     | `refactor/`   | No                    |
| Docs/config | only `.md`, `.yml`, `.json`      | `docs/`       | No                    |


### Step 1 — Create a branch

```bash
git checkout main && git pull
git checkout -b feat/<short-description>
# e.g.: feat/export-to-pdf  |  fix/crash-on-empty-list  |  refactor/extract-quota
```

### Step 2 — Decide on feature flag (features only)

Skip for bug fixes and refactors.

If the feature is **user-visible or experimental**:

- Choose flag name: `dome-<feature>` (e.g. `dome-export-pdf`, `dome-new-onboarding`)
- Wrap new UI/logic behind the flag gate:

```tsx
import { FeatureFlagGate } from '@/components/analytics/FeatureFlagGate';
// or
import { useFeatureFlagEnabled } from '@/lib/analytics';

// Whole section
<FeatureFlagGate flag="dome-my-feature" fallback={<OldVersion />}>
  <NewVersion />
</FeatureFlagGate>

// Conditional logic
const isEnabled = useFeatureFlagEnabled('dome-my-feature');
```

If the feature is **internal / infrastructure** (no user-visible change): skip the flag.

### Step 3 — Implement

**The non-negotiable rules CI enforces:**

#### Renderer/main process boundary

```typescript
// ✅ In app/ — use IPC
const result = await window.electron.invoke('resources:create', data);

// ❌ NEVER in app/ — these will be caught by the architecture guard
import Database from 'better-sqlite3';
import fs from 'fs';
import { ipcRenderer } from 'electron';
```

#### New IPC channel (follow every step or it silently fails)

1. Handler in `electron/ipc/<domain>.cjs` — validate inputs, return `{ success, data/error }`
2. Register in `electron/ipc/index.cjs`
3. Add channel name to `electron/preload.cjs` ALLOWED_CHANNELS array
4. Call from renderer via `window.electron.invoke('domain:action', args)`

Full guide: `.claude/sops/new-ipc-channel.md`

#### i18n — required for all user-visible strings

```typescript
// In the component
const { t } = useTranslation();
return <span>{t('my_feature.title')}</span>;

// In app/lib/i18n.ts — add to ALL 4 language objects (en, es, fr, pt)
'my_feature.title': 'My Feature',        // en
'my_feature.title': 'Mi Función',        // es
'my_feature.title': 'Ma Fonctionnalité', // fr
'my_feature.title': 'Minha Funcionalidade', // pt
```

#### Colors — always CSS variables

```tsx
// ✅
style={{ color: 'var(--primary-text)', background: 'var(--bg-secondary)' }}
// ❌ will be flagged in AI review
style={{ color: '#040316', background: '#f2f2f9' }}
```

#### Type imports — verbatimModuleSyntax is ON

```typescript
import type { Resource } from '@/types'; // ✅ type-only
import { Resource } from '@/types';      // ❌ if Resource is only a type
```

#### TypeScript — no any

```typescript
// ✅
function createResource(data: Partial<Resource>): Resource { ... }
// ❌
function createResource(data: any): any { ... }
```

### Step 4 — Validate locally

Run before opening the PR. Fix any failures before proceeding.

```bash
npm run typecheck   # 0 errors required
npm run lint        # 0 warnings required
npm run build       # must succeed
```

Quick architecture self-check (must return 0 lines):

```bash
grep -rn "better-sqlite3\|bun:sqlite\|from 'fs'" app/ --include="*.ts" --include="*.tsx"
```

### Step 5 — Open the PR

The `Flag:` field in the description is parsed by the post-merge automation.
If there is no flag, write `none`.

```bash
gh pr create \
  --title "feat: <short description>" \
  --body "$(cat <<'EOF'
## Summary
- <what changed and why, 1-3 bullets>

## Flag
<!-- Feature flag name (dome-xxx) or "none" -->
Flag: dome-REPLACE_ME

## Type
- [ ] New feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Docs/config

## Checklist
- [ ] typecheck passes
- [ ] lint passes
- [ ] build passes
- [ ] i18n keys in all 4 languages (if new strings)
- [ ] No hardcoded colors
EOF
)"
```

### Step 6 — Enable auto-merge

```bash
gh pr merge --auto --squash
```

GitHub will merge the PR automatically the moment all required CI checks pass.

### Step 7 — Done ✓

Your work is complete. The automated pipeline takes over:

```
PR open
  ├─► CI: typecheck + lint + build + architecture guard   (~3 min)
  ├─► AI Code Review: 3 passes with line-level comments   (~2 min)
  └─► Auto-merge when all checks pass
        └─► Post-merge: feature flag enabled for team in PostHog
```

You do not need to merge, enable flags, monitor, or do anything else.

---

## Automated agents — editing prompts

Two agent pipelines run against the repo. Their prompts are **versioned files
on disk**, not inlined in scripts — edit the markdown to tune behavior.

### AI review (GitHub Actions, `.github/workflows/ai-review.yml`)

Runs 3 passes per PR, posting a review with line-level comments anchored to
the diff. Each pass has its own prompt; the model returns strict JSON.

- `prompts/review/architecture.md` — process separation, IPC whitelist, import type
- `prompts/review/logic.md` — runtime errors, security, async correctness
- `prompts/review/style.md` — CSS vars, i18n coverage, `any` types, React anti-patterns

The driver is `scripts/ai-review.mjs`. Diffs are split by file (no 40KB
truncation); large files are clipped at 60KB with a note in the summary.

### VPS audits (OpenCode + MiniMax on a cron-driven VPS)

Periodic sweeps per focus domain. Each focus has one prompt + a shared context
block. Prompts include explicit "run `npm run typecheck` / `grep` before fixing"
instructions so the agent verifies findings against live code.

- `prompts/shared/project-context.md` — shared across all audit prompts
- `prompts/audits/<focus>.md` — one per focus (security, types, i18n, debt, vulns,
  react, errors, deps, all)
- `prompts/audits/_chain-header.md` — injected when multiple focuses run in a
  chain via `scripts/vps-audit-chain.sh`

### Frontmatter versioning rule

Every prompt file carries YAML frontmatter with `version:` (integer). **Bump
the version when you change the prompt semantics.** The driver stamps each PR
body with a `Prompt bundle` tag (e.g. `shared@1+security@2`) and persists
`first_seen_prompt_version` on each finding, so regressions can be correlated
to a specific prompt version.

---

## Reference — where to look


| Need                        | Location                              |
| --------------------------- | ------------------------------------- |
| Architecture rules          | `.claude/rules/architecture-rules.md` |
| New IPC step-by-step        | `.claude/sops/new-ipc-channel.md`     |
| Feature flags usage         | `.claude/sops/feature-flags.md`       |
| PR checklist                | `.claude/sops/pr-checklist.md`        |
| Release process             | `.claude/sops/release.md`             |
| Color palette variables     | `.claude/rules/new-color-palette.md`  |
| All translations            | `app/lib/i18n.ts`                     |
| Existing IPC domains        | `electron/ipc/` (one file per domain) |
| Zustand stores              | `app/lib/store/`                      |
| Tab system                  | `app/lib/store/useTabStore.ts`        |
| Existing components         | `app/components/`                     |
| Electron window creation    | `electron/window-manager.cjs`         |
| AI review prompts           | `prompts/review/*.md`                 |
| VPS audit prompts           | `prompts/audits/*.md` + `prompts/shared/` |
| Audit milestones / targets  | `scripts/audit-milestones.json`       |
| VPS audit + dashboard setup | `docs/vps-audit-setup.md`             |


