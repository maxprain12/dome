#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Guard: electron-builder must collect EVERY production dependency.
 *
 * electron-builder builds the list of node_modules to copy into app.asar from
 * `pnpm list --json`. When its collector cannot resolve a dependency it only
 * logs a warning and drops the package, and the packaged app then crashes at
 * startup with `Cannot find module '<pkg>'` (Dome 2.9.0 / 2.9.1: `once`,
 * `debug`, `ajv`, `express`… were missing). Dev never shows it.
 *
 * This runs the same collector electron-builder uses (the patched copy from
 * patches/app-builder-lib@*.patch) without packaging, so it is cheap enough for
 * every PR, and fails on any unresolved dependency.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** Collector log keys that mean a production dependency will be missing from app.asar. */
const BLOCKING_LOG_KEYS = ['PKG_DUPLICATE_REF_UNRESOLVED', 'PKG_NOT_FOUND'];

function resolveFromElectronBuilder(request) {
  const electronBuilderDir = fs.realpathSync(path.join(ROOT, 'node_modules', 'electron-builder'));
  const appBuilderLibDir = path.dirname(
    require.resolve('app-builder-lib/package.json', { paths: [electronBuilderDir] }),
  );
  return require.resolve(request, { paths: [appBuilderLibDir] });
}

async function main() {
  const { getCollectorByPackageManager, PM } = require(
    resolveFromElectronBuilder('app-builder-lib/out/node-module-collector/index.js'),
  );
  const { LogMessageByKey } = require(
    resolveFromElectronBuilder('app-builder-lib/out/node-module-collector/moduleManager.js'),
  );
  const { TmpDir } = require(resolveFromElectronBuilder('builder-util'));

  const packageName = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
  const tmp = new TmpDir('check-packaged-deps');
  try {
    const collector = getCollectorByPackageManager(PM.PNPM, ROOT, tmp);
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName });

    const problems = [];
    for (const key of BLOCKING_LOG_KEYS) {
      const label = LogMessageByKey[key];
      const entries = logSummary[label] || [];
      if (entries.length > 0) {
        problems.push(`${label} (${entries.length}): ${entries.join(', ')}`);
      }
    }

    if (problems.length > 0) {
      console.error('\n❌ packaged-deps check FAILED — electron-builder would drop these from app.asar:\n');
      for (const p of problems) console.error(`   ${p}`);
      console.error('\nSee patches/app-builder-lib@*.patch and scripts/check-packaged-deps.cjs.\n');
      process.exit(1);
    }

    console.log(`✅ packaged-deps: electron-builder resolves all ${nodeModules.length} top-level production modules`);
  } finally {
    await tmp.cleanup();
  }
}

main().catch((err) => {
  console.error('❌ packaged-deps check crashed:', err);
  process.exit(1);
});
