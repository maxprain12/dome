# SOP: Cutting a Release

Releases are built by hand on each OS and uploaded to the update feed. Woodpecker does not package installers.

## Prerequisites

| Machine | Needs |
|---|---|
| macOS | Xcode, Developer ID Application, `xcrun notarytool`, Node 24, pnpm 11.8.0 |
| Windows | `CSC_LINK` / `CSC_KEY_PASSWORD`, Node 24, pnpm 11.8.0 |
| Linux x64 | `flatpak-builder` and runtimes 24.08 (`Platform`, `Sdk`, `Electron2.BaseApp`), Node 24, pnpm 11.8.0 |

Every machine has the same `.env.release.local` (from `.env.release.example`), with the staging keys and the public R2 keys.

## Steps

1. Draft notes: `pnpm run release:notes`. Curate them into `CHANGELOG.md` as `## [X.Y.Z](https://dome.dowi.es/changelog#vX.Y.Z) - YYYY-MM-DD`.
2. Bump `package.json` `version` on a branch, open a PR, and squash-merge. `main` rejects a direct push. After the merge is on `origin/main`: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. On each machine (Mac, Windows, Linux), checkout that tag and publish. Fetch the tag by name so a stale local tag does not abort the fetch:

```bash
git fetch origin tag vX.Y.Z && git checkout vX.Y.Z && pnpm run release -- --github-bridge
```

4. A broken release: `pnpm run release:promote -- --channel latest --pause`, then ship a patch. There is no downgrade.

`--github-bridge` creates the GitHub release or uploads this OS's files if the release already exists. Installs older than 2.9.0 still update from GitHub. Later, `--bridge-only` copies an already staged version to `GITHUB_BRIDGE_REPO`.
