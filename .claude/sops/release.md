# SOP: Cutting a Release

## Pre-release Checklist

- [ ] All in-progress features are merged or intentionally deferred
- [ ] CI is green on `main` (typecheck, lint, build all pass)
- [ ] Tested the app end-to-end locally (`npm run electron:dev`)
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

## Hotfix process

For urgent fixes:
1. Branch off `main`: `git checkout -b hotfix/description`
2. Fix the issue
3. Merge to `main` (no PR required for P0 hotfixes)
4. Immediately cut a patch release (e.g., `v2.1.5` → `v2.1.6`)
