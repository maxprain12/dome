#!/usr/bin/env node
/**
 * After-pack hook for electron-builder
 * Ensures native modules are correctly unpacked and accessible
 */

const fs = require('fs');
const path = require('path');

/**
 * codesign --verify --deep --strict rejects symlinks whose target resolves outside the .app.
 * Python venvs and some wheels leave such links; materialize them as real files/dirs.
 */
function collectSymlinksUnder(rootDir, acc = []) {
  if (!fs.existsSync(rootDir)) return acc;
  let entries;
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = path.join(rootDir, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      acc.push(full);
    } else if (st.isDirectory()) {
      collectSymlinksUnder(full, acc);
    }
  }
  return acc;
}

function fixSymlinksOutsideAppBundle(appBundlePath, dirsToScan) {
  let appReal;
  try {
    appReal = fs.realpathSync(appBundlePath);
  } catch (e) {
    console.warn('[AfterPack] Could not realpath app bundle:', e.message);
    return;
  }
  const appPrefix = appReal + path.sep;

  for (let pass = 0; pass < 30; pass += 1) {
    const symlinks = [];
    for (const d of dirsToScan) {
      if (fs.existsSync(d)) {
        collectSymlinksUnder(d, symlinks);
      }
    }
    symlinks.sort((a, b) => b.length - a.length);

    let changed = 0;
    for (const linkPath of symlinks) {
      let resolved;
      try {
        resolved = fs.realpathSync(linkPath);
      } catch {
        console.warn('[AfterPack] Removing broken symlink:', linkPath);
        try {
          fs.unlinkSync(linkPath);
        } catch {}
        changed += 1;
        continue;
      }
      if (resolved === appReal || resolved.startsWith(appPrefix)) {
        continue;
      }

      const rawTarget = fs.readlinkSync(linkPath);
      const sourceAbs = path.isAbsolute(rawTarget)
        ? rawTarget
        : path.resolve(path.dirname(linkPath), rawTarget);

      let stats;
      try {
        stats = fs.statSync(sourceAbs);
      } catch (e) {
        console.warn('[AfterPack] Skipping unreadable symlink:', linkPath, e.message);
        continue;
      }

      try {
        fs.unlinkSync(linkPath);
        if (stats.isDirectory()) {
          fs.cpSync(sourceAbs, linkPath, { recursive: true, dereference: true });
        } else {
          fs.copyFileSync(sourceAbs, linkPath);
        }
        console.log('[AfterPack] Materialized symlink for codesign:', linkPath);
        changed += 1;
      } catch (e) {
        console.warn('[AfterPack] Failed to materialize symlink:', linkPath, e.message);
      }
    }

    if (changed === 0) {
      break;
    }
    console.log(`[AfterPack] Symlink sanitization pass ${pass + 1}: fixed ${changed} item(s)`);
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;

  console.log('[AfterPack] Running after-pack hook...');
  console.log('[AfterPack] Platform:', electronPlatformName);
  console.log('[AfterPack] Output directory:', appOutDir);

  // Determine the resources path based on platform
  let resourcesPath;
  if (electronPlatformName === 'darwin') {
    resourcesPath = path.join(appOutDir, 'Dome.app', 'Contents', 'Resources');
  } else if (electronPlatformName === 'win32') {
    resourcesPath = path.join(appOutDir, 'resources');
  } else {
    resourcesPath = path.join(appOutDir, 'resources');
  }

  console.log('[AfterPack] Resources path:', resourcesPath);

  // Check if app.asar.unpacked exists
  const asarUnpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
  // Collected hard failures — we throw at the end so the packaged build never
  // ships with a missing native module / binary (which crashes only in prod).
  const fatal = [];

  if (fs.existsSync(asarUnpackedPath)) {
    console.log('[AfterPack] ✅ app.asar.unpacked exists');

    // Verify critical native modules / binaries are actually unpacked.
    // Keep in sync with build.asarUnpack in package.json — scripts/check-asar-unpack.cjs
    // enforces that every entry here is covered by an asarUnpack glob.
    const criticalModules = [
      'node_modules/better-sqlite3',
      'node_modules/sharp',
      'node_modules/@ffmpeg-installer',
      'node_modules/@napi-rs/canvas',
      'node_modules/@lancedb/lancedb',
      'node_modules/@duckdb',
    ];

    for (const modulePath of criticalModules) {
      const fullPath = path.join(asarUnpackedPath, modulePath);
      if (fs.existsSync(fullPath)) {
        console.log(`[AfterPack] ✅ ${modulePath} is unpacked`);

        // Check for .node files
        const nodeFiles = findNodeFiles(fullPath);
        if (nodeFiles.length > 0) {
          console.log(`[AfterPack]    Found ${nodeFiles.length} .node files:`);
          nodeFiles.forEach(file => {
            console.log(`[AfterPack]      - ${path.relative(fullPath, file)}`);
          });
        }
      } else {
        fatal.push(`${modulePath} is NOT unpacked (add to build.asarUnpack)`);
        console.error(`[AfterPack] ❌ ${modulePath} is NOT unpacked!`);
      }
    }

    // The 2.6.0 crash: the ffmpeg binary must exist OUTSIDE app.asar and be
    // executable. Verify the actual platform binary is present and not in-asar.
    const ffmpegErr = verifyFfmpegBinary(asarUnpackedPath, electronPlatformName);
    if (ffmpegErr) {
      fatal.push(ffmpegErr);
      console.error(`[AfterPack] ❌ ${ffmpegErr}`);
    } else {
      console.log('[AfterPack] ✅ ffmpeg binary is unpacked and executable');
    }
  } else {
    fatal.push('app.asar.unpacked does NOT exist — native modules will not work in production');
    console.error('[AfterPack] ❌ app.asar.unpacked does NOT exist!');
  }

  if (electronPlatformName === 'darwin') {
    const appBundle = path.join(appOutDir, 'Dome.app');
    const scanDirs = [path.join(resourcesPath, 'app.asar.unpacked')].filter((p) => fs.existsSync(p));
    if (scanDirs.length > 0) {
      console.log('[AfterPack] Checking symlinks for macOS codesign (strict)...');
      fixSymlinksOutsideAppBundle(appBundle, scanDirs);
    }
  }

  if (fatal.length > 0) {
    console.error('\n[AfterPack] ❌ Packaging gate failed — refusing to ship a broken build:');
    for (const f of fatal) console.error(`[AfterPack]   • ${f}`);
    throw new Error(`after-pack: ${fatal.length} critical packaging problem(s) — see log above`);
  }

  console.log('[AfterPack] After-pack hook completed');
};

/**
 * Verify the ffmpeg binary is unpacked (outside app.asar) and executable.
 * Returns an error string on failure, or null on success.
 * This is the exact regression that crashed Dome 2.6.0 (spawn ENOTDIR from
 * an app.asar ffmpeg path).
 */
function verifyFfmpegBinary(asarUnpackedPath, electronPlatformName) {
  const platformDir = {
    darwin: process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
    win32: process.arch === 'ia32' ? 'win32-ia32' : 'win32-x64',
    linux: process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64',
  }[electronPlatformName];

  if (!platformDir) {
    // Unknown platform: confirm at least one ffmpeg binary is unpacked.
    const base = path.join(asarUnpackedPath, 'node_modules', '@ffmpeg-installer');
    return fs.existsSync(base) ? null : '@ffmpeg-installer not unpacked';
  }

  const binName = electronPlatformName === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const binPath = path.join(
    asarUnpackedPath, 'node_modules', '@ffmpeg-installer', platformDir, binName,
  );
  if (!fs.existsSync(binPath)) {
    return `ffmpeg binary missing at ${path.relative(asarUnpackedPath, binPath)} (must be in app.asar.unpacked, not app.asar)`;
  }
  if (electronPlatformName !== 'win32') {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      return `ffmpeg binary not executable: ${binPath}`;
    }
  }
  return null;
}

/**
 * Recursively find all .node files in a directory
 */
function findNodeFiles(dir) {
  const nodeFiles = [];

  function walk(currentPath) {
    if (!fs.existsSync(currentPath)) return;

    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.node')) {
        nodeFiles.push(fullPath);
      }
    }
  }

  walk(dir);
  return nodeFiles;
}
