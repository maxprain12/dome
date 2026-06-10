# SOP: Cutting a Release

## Pre-release Checklist

- [ ] All in-progress features are merged or intentionally deferred
- [ ] CI is green on `main` (typecheck, lint, build all pass)
- [ ] Tested the app end-to-end locally (`pnpm run electron:dev`)
- [ ] **Packaged build tested** with `pnpm run electron:build` and the resulting app launches without main-process `Cannot find module ...` errors (CI only runs Vite, not electron-builder — see [shared-module-from-electron.md](./shared-module-from-electron.md) and [workspace-packages-packaging.md](./workspace-packages-packaging.md))
- [ ] **`@dome/*` workspace packages** built and materialized (`pnpm run verify:workspace-deps` passes) before tagging a release
- [ ] Version bump is correct (semver: patch for bugfixes, minor for features, major for breaking changes)

## Steps

### 1. Bump version

In `package.json`:
```json
"version": "2.1.5"
```

### 2. Commit the version bump

```bash
git add package.json
git commit -m "chore: release v2.1.5"
git push origin main
```

### 3. Create the GitHub Release

```bash
gh release create v2.1.5 \
  --title "v2.1.5" \
  --notes "## What's new\n- ..." \
  --latest
```

Or via GitHub UI: Releases → Draft a new release → Tag: `v2.1.5`

### 4. CI does the rest

The `build.yml` workflow triggers automatically on release publish:
- Builds macOS (arm64 + x64) DMG and ZIP
- Builds Windows NSIS installer and portable EXE
- Attaches all artifacts to the GitHub Release

### 5. Verify

- [ ] Build workflow passes in GitHub Actions
- [ ] All 4 release artifacts appear in the GitHub Release
- [ ] Test the DMG/EXE on a clean machine if possible

## Dependency & Electron version policy

- **Electron**: stay on a major with upstream security support (Electron supports the **3 latest majors**). Check the [Electron releases timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) at every release; if our major is about to fall out of support, schedule the upgrade as its own PR (rebuild natives with `pnpm run rebuild:natives` + `verify:natives`, full smoke on macOS and Windows). Renovate is configured to **not** open Electron major PRs (`renovate.json`) — that upgrade is always manual and tested.
- **Security updates**: Renovate opens vulnerability PRs immediately (any package) and groups routine minor/patch bumps into a weekly PR. Native modules (`better-sqlite3`, `sharp`, `@napi-rs/canvas`, `electron-updater`) get individual PRs and must pass a packaged-build smoke before merge.
- **CI**: `pnpm audit --prod --audit-level=high` runs on every PR (non-blocking during triage; make blocking once the baseline is clean). Review notes for the higher-risk parsers (`pyodide`, `pptx-preview`, `linkedom`) live in `docs/auditoria/06-calidad-observabilidad/T04-auditoria-dependencias.md`.

## Hotfix process

For urgent fixes:
1. Branch off `main`: `git checkout -b hotfix/description`
2. Fix the issue
3. Merge to `main` (no PR required for P0 hotfixes)
4. Immediately cut a patch release (e.g., `v2.1.5` → `v2.1.6`)
