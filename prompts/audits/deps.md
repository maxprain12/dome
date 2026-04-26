---

## name: audit-deps
description: Package authorization & freshness — keep dependencies authorized, up-to-date within semver, and CVE-free.
version: 1
focus: deps
last_updated: 2026-04-17

## Focus: Package Authorization & Freshness (deps audit)

Mission: keep every dependency in `package.json` authorized (already listed),
up-to-date within its semver range, and free of HIGH/CRITICAL CVEs. This focus
differs from `vulns` — `vulns` audits whether vulnerable code paths are USED;
`deps` keeps the manifest and lockfiles healthy.

### Step 1 — Inventory

```bash
cat package.json | jq '.dependencies, .devDependencies'
```

Record the exact list of authorized package names BEFORE any change. You
MUST NOT add packages that weren't already listed — removing or bumping is
fine, adding new packages is forbidden in this audit.

### Step 2 — Vulnerability scan

```bash
npm audit --json > /tmp/npm-audit.json
```

Parse the JSON. For every advisory with severity ∈ {high, critical}:

- Note: module name, version range, CVE id, advisory URL, patched range
- If `fixAvailable` is true and it's a safe (patch/minor) bump → apply via
`npm install <pkg>@<patched-version> --save --ignore-scripts`
- If fix requires a major bump of a frozen package (see Step 4) → add a
row in `SECURITY.md` documenting the CVE (create the file if missing)

### Step 3 — Outdated scan (patch + minor only)

```bash
npm outdated --json > /tmp/npm-outdated.json
```

For every package where `current < wanted` (i.e. the semver range allows it):

- Bump to `wanted` via: `npm install <pkg>@<wanted> --save --ignore-scripts`
- Do NOT bump to `latest` when `latest` crosses a major boundary

Skip packages listed in the FROZEN whitelist (Step 4).

### Step 4 — Frozen packages (NEVER bump, even patch, without a follow-up issue)

- `electron`
- `better-sqlite3`
- `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `@langchain/anthropic`,
`@langchain/google-genai`, `@langchain/community`
- `vite`, `@vitejs/plugin-react`
- `react`, `react-dom`
- `@tiptap/*` (breaking changes between minors)
- `node-pty`, `sharp`, `@napi-rs/canvas`, `archiver`, `yauzl` (native modules)

If you believe a frozen package MUST be bumped for security, do NOT bump it.
Instead append an entry to `SECURITY.md` with the CVE and a TODO for manual review.

### Step 5 — Lockfile coherence

The project uses `npm` for CI/CD. After any `package.json` change, regenerate
`package-lock.json` so it agrees with the manifest:

```bash
rm -f package-lock.json
npm install --ignore-scripts      # regenerates package-lock.json
```

Never commit a stale `package-lock.json` — CI runs `npm ci` which aborts on
any drift between `package.json` and the lockfile. The project is **npm**-only.

### Step 6 — Validate

```bash
npm run typecheck
npm run lint
npm run build
```

If any fails, revert the specific package that caused the regression and
flag it in `SECURITY.md`.

### Step 7 — Summary report

After fixes, write a short bulleted summary at the top of the PR body
describing: N CVEs auto-fixed, M packages bumped (patch+minor), K frozen
packages deferred, exact list of bumped packages with from→to versions.

### HARD RULES

- NEVER add a package not already in `package.json`.
- NEVER remove a package that's still imported in the codebase.
- NEVER bump a frozen package.
- NEVER run `npm audit fix --force` — it ignores semver constraints.
- If in doubt, do less and document in `SECURITY.md`.

