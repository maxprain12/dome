# Sonar clean-code patterns (agent + CI)

Patterns learned from SonarQube campaigns on `dome`. Agents **must** avoid introducing them. CI enforces a subset via `pnpm run check:sonar-patterns` (see [scripts/check-sonar-patterns.mjs](../../scripts/check-sonar-patterns.mjs)).

Principle id: **P-011**. Cursor rule: [`.cursor/rules/sonar-clean-code.mdc`](../../.cursor/rules/sonar-clean-code.mdc).

## Priority when fixing / reviewing

1. SECURITY / BUG / VULNERABILITY  
2. CRITICAL maintainability (cognitive complexity S3776) — only small/medium files  
3. Mechanical debt (S7735, S7772, S7764) in focused batches  

## Rules (do / don't)

### S2819 — `postMessage` target origin

| Bad | Good |
|-----|------|
| `win.postMessage(msg, '*')` | `win.postMessage(msg, artifactFrameTargetOrigin(src))` |

Sandboxed artifact frames: use the frame URL origin, or `'null'` for opaque `srcdoc`. Prefer a shared helper (see `ArtifactWorkspaceClient`).

**Allow:** messages inside generated iframe `srcdoc` HTML that talk to `window.parent` (opaque origin contract).

### S2871 — `.sort()` without compare

| Bad | Good |
|-----|------|
| `keys.sort()` | `keys.sort((a, b) => a.localeCompare(b))` |
| `ids.sort()` (strings) | same |

Numeric sorts: `(a, b) => a - b`. Never rely on default lexicographic sort for domain data.

### S7735 — unnecessary `void`

| Bad | Good |
|-----|------|
| `onClick={() => void save()}` | `onClick={() => { void save().catch(() => {}); }}` or sync call without `void` |

See [`.cursor/rules/no-void-operator.mdc`](../../.cursor/rules/no-void-operator.mdc). Mechanical: `node scripts/sonar/fix-void-operator.mjs`.

### S7772 — Node core imports

In `electron/` / `shared/` CJS:

| Bad | Good |
|-----|------|
| `require('fs')` | `require('node:fs')` |
| `require('path')` | `require('node:path')` |
| `require('crypto')` | `require('node:crypto')` |

Same for `events`, `os`, `url`, `util`, `stream`, `buffer`, `child_process`, `worker_threads`, etc.

### S7764 — `globalThis` vs `window` (renderer)

Prefer `globalThis` / `globalThis.window` for Electron-safe access:

```ts
const win = globalThis.window;
if (!win?.electron?.on) return;
```

Do **not** blindly rewrite Electron `main` process code.

### S6638 — constant nullish / truthiness

| Bad | Good |
|-----|------|
| `String(x) ?? null` | `String(x)` (or `x == null ? null : String(x)`) |
| `Number(x) ?? 37214` | `Number(x) \|\| 37214` (or `Number.isFinite`) |
| `0 && expr` / always-true `\|\|` | delete dead branch |

### S3923 — identical branches

| Bad | Good |
|-----|------|
| `cond ? 'local' : 'local'` | `'local'` |
| `isSelected ? 1 : 1` | `1` |

### S6439 — leaked values in JSX `&&`

| Bad | Good |
|-----|------|
| `{count && <Badge />}` | `{!!count && <Badge />}` or `{count > 0 && …}` |

Numbers (`0`) and some strings leak into the DOM.

### S4822 — promises in `try` without `await`

Await the promise inside `try`, or attach `.catch()` outside and do not wrap a floating promise in `try/catch` expecting rejection to be caught.

### S6328 — regex replace groups

Only use `$1` when the pattern has a capturing group:

```ts
// Bad: no group
.replace(/\[[^\]]*]\([^)]*\)/g, '$1')
// Good: capture label or drop links
.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
// or .replace(..., ' ')
```

### S4657 — CSS `font` shorthand

Put longhand **after** shorthand if both are needed:

```css
font: inherit;
font-weight: 500; /* after font */
```

### S3403 — absurd equality

Do not compare with `===` / `!==` when types make the result always true/false. Coerce or use the correct operator (`==` only when intentional for nullish).

### S1534 — duplicate object keys

Never repeat the same key in an object literal; merge entries.

### False positives (Accept in Sonar, do not “fix” insecurely)

| Rule | Example | Action |
|------|---------|--------|
| S2068 | i18n key `weak_password`, env name `DOME_*_PASSWORD` | Accept + comment |
| S1313 | Private IP ranges in SSRF allowlists (`url-guard`) | Accept + document |
| S6440 | Helper named `useViteDevServer` in Electron (not a React hook) | Accept or rename without `use` prefix |

### S3776 — cognitive complexity

Extract helpers / early returns. **Defer** `migrations.cjs` and files &gt;1500 LOC to dedicated PRs. Max ~2 complexity issues per PR when heavy.

## CI / local

```bash
# Full tree — strict (low-noise) rules
pnpm run check:sonar-patterns

# Only files changed vs main (strict + progressive rules)
pnpm run check:sonar-patterns -- --diff=origin/main

# Unit tests for the checker
pnpm run test:sonar-patterns
```

CI (`Lint` job) runs both the full strict check and the diff progressive check on pull requests.

## Extending this list

When a Sonar batch teaches a new recurring pattern:

1. Add a row here (bad / good).  
2. Add a detector in `scripts/check-sonar-patterns.mjs` (prefer **diff** mode until backlog ≈ 0).  
3. Add a fixture case in `scripts/__tests__/check-sonar-patterns.test.mjs`.  
4. Mention the rule id in the PR that cleans the last occurrences if promoting to **strict**.
