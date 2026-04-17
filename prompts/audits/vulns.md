---
name: audit-vulns
description: Dependency vulnerability scan — npm audit HIGH/CRITICAL, safer alternatives.
version: 1
focus: vulns
last_updated: 2026-04-17
---

## Focus: Dependency Vulnerabilities

Audit npm dependencies for security vulnerabilities and outdated packages.

### Step 1 — Run npm audit and read the output

```bash
npm audit --json
```

### Step 2 — For each HIGH or CRITICAL vulnerability

- Read the advisory to understand the attack vector
- Check if Dome actually uses the vulnerable code path
- If a safe fix exists (`npm audit fix --dry-run` shows it): apply it
- If it requires a major version bump: add a TODO comment in `package.json` with the issue

### Step 3 — Check for packages with known safer alternatives

- Any `request` package → should be `node-fetch` or native fetch
- Any `node-uuid` → should be `crypto.randomUUID()`

### IMPORTANT

- Run `npm install --ignore-scripts` after any `package.json` change
- Do NOT bump major versions of `electron`, `better-sqlite3`, or `@langchain/*` — these have breaking changes
- Do NOT run `npm audit fix --force` — apply fixes selectively
