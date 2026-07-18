# Sonar: Hotspots Reviewed + Coverage

How Dome gets (and keeps) a green Quality Gate on these two cards.

## Hotspots Reviewed (Security Review rating)

### What it is

A **Security Hotspot** is not a confirmed vulnerability. It is code that *might* be risky (regex DoS, `Math.random`, weak hashes, OS commands, `eval`) and **needs a human decision**.

| Resolution | Meaning |
|------------|---------|
| **Safe** | Reviewed; risk accepted / not exploitable in this context |
| **Fixed** | Code was changed to remove the risk |
| **Acknowledged** | Known debt; tracked, not yet fixed |

**Hotspots Reviewed** = % of hotspots marked Safe / Fixed / Acknowledged (not left `TO_REVIEW`).

### Ratings

| Grade | Reviewed % |
|-------|------------|
| **A** | ≥ 80% |
| B | 70–79.9% |
| C | 50–69.9% |
| D | 30–49.9% |
| E | &lt; 30% |

Dome’s Quality Gate on **new code** often requires **100%** hotspots reviewed — so new hotspots must be reviewed in the same PR cycle.

### Current Dome inventory (typical)

Almost all open hotspots are:

| Rule | Theme | Usual resolution |
|------|--------|------------------|
| S5852 | ReDoS (regex) | **Safe** if input is trusted/bounded; else harden regex |
| S2245 | `Math.random` | **Safe** for UI/ids/shuffle; use `crypto` for secrets |
| S4790 | Weak hash (md5/sha1) | **Safe** if not for passwords/auth (e.g. content fingerprints) |
| S4036 | `PATH` / OS command | Review carefully; prefer fixed paths |
| S1523 | Dynamic code (`eval` / Function) | Prefer remove; else document Safe |

### How to raise to A

1. Open Sonar → **Security Hotspots** → filter `To review`.
2. Or CLI / script:
   ```bash
   # Dry-run classification
   pnpm run sonar:review-hotspots -- --dry-run
   # Apply Safe/Fixed after review
   pnpm run sonar:review-hotspots -- --apply=true
   ```
3. **Jenkins `dome-quality-loop`** runs `sonar:review-hotspots --apply` in **post always** (even when Fast gates fail).
4. For **new** hotspots on a PR: review before merge (QG fails at 0% reviewed on new code).

Do **not** bulk-mark Safe without reading the rule + call site. The script uses a conservative classifier (SAFE for clear UI/`Math.random`/fingerprints; ACKNOWLEDGED for ReDoS debt).

---

## Coverage

### Why the dashboard shows ~5–6%

Sonar only sees lines present in `coverage/lcov.info` (see `sonar-project.properties` → `sonar.javascript.lcov.reportPaths`).

Historically that file was merged from:

- `coverage/electron/lcov.info` (`c8` + `electron/__tests__`)
- `packages/agent-core/coverage/lcov.info`

Most of the ~234k ncloc (`app/`, other packages) contributed **0** covered lines → overall % stays tiny even when electron/agent-core are well tested.

### How we raise it

1. **Always** run `pnpm run test:coverage` before `dome-sonar` analysis (Jenkins already does).
2. Expand lcov inputs (see `scripts/sonar/merge-coverage.mjs`):
   - Renderer: `coverage/renderer/lcov.info` (`vitest` + `@vitest/coverage-v8`)
   - Packages with tests: `agent-core`, `ai`
3. Prefer tests on **new code** (QG often requires ≥50–80% on new code) over boiling the ocean on legacy UI.
4. **Jenkins coverage mode** (~1/3 of hourly runs): `sonar:pick-coverage` → OpenCode `sonar-coverage` agent adds tests for top `uncovered_lines` files → PR `test/sonar-coverage-*`. Over days this compounds without blocking issue fixes.

### Local commands

```bash
pnpm run test:coverage          # electron + renderer + agent-core + ai → coverage/lcov.info
pnpm run test:coverage:renderer # vitest app/**/*.test.*
pnpm run test:coverage:ai       # @dome/ai vitest coverage
pnpm run test:coverage:electron # c8 on electron/__tests__
```

### Practical tip for QG

If Overall Coverage is hard to move quickly, tighten **New Code** coverage first (tests for every PR that touches logic). That unblocks the gate while Overall climbs over months.
