# SOP: Cutting a Release

Releases are built by hand on each OS and uploaded to the update feed. Woodpecker does not package installers.

## Prerequisites

| Machine | Needs |
|---|---|
| macOS | Xcode, Developer ID Application, `xcrun notarytool`, Node 24, pnpm 11.8.0 |
| Windows | `CSC_LINK` / `CSC_KEY_PASSWORD`, Node 24, pnpm 11.8.0 |
| Linux x64 | `flatpak-builder` and runtimes 24.08 (`Platform`, `Sdk`, `Electron2.BaseApp`), Node 24, pnpm 11.8.0 |

Every machine has `.env.release.local` (from `.env.release.example`) with build credentials. Only the publish machine has the public bucket keys.

## Steps

1. Draft notes: `pnpm run release:notes`. Curate them into `CHANGELOG.md` as `## [X.Y.Z](https://dome.dowi.es/changelog#vX.Y.Z) - YYYY-MM-DD`.
2. Bump `package.json` `version`, commit, tag and push: `git tag vX.Y.Z && git push origin main --tags`.
3. On each machine: `git fetch --tags && git checkout vX.Y.Z && pnpm run release:build`.
4. On the publish machine: `pnpm run release:publish -- --channel beta --staging 10`.
5. Smoke-test clean machines, then `pnpm run release:promote -- --channel latest --staging 10`, then 50, then 100.
6. A broken release: `pnpm run release:promote -- --channel latest --pause`, then ship a patch. There is no downgrade.

Bridge release (while GitHub Releases still serves installs older than 2.9.0): add `--github-bridge`. Later, `--bridge-only` copies an already staged version to `GITHUB_BRIDGE_REPO`.
