/* eslint-disable no-console */
/**
 * himalaya binary resolver.
 *
 * Strategy (mirrors the Ollama "manage an external binary" precedent):
 *   1. Explicit override: env `DOME_HIMALAYA_PATH` or the `email_himalaya_path` setting.
 *   2. A previously downloaded binary under `userData/bin/`.
 *   3. A `himalaya` already on the user's PATH (great for dev).
 *   4. Otherwise download the pinned release for this platform on demand.
 *
 * NOTE: the pinned version + release asset names below must match a real
 * himalaya GitHub release. They are centralized here so they can be corrected
 * in one place if the upstream naming changes.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

let app = null;
try {
  ({ app } = require('electron'));
} catch {
  /* outside Electron (unit tests) */
}

// Pinned himalaya release. See https://github.com/pimalaya/himalaya/releases
// Asset naming (verified v1.2.0): himalaya.<arch>-<os>.{tgz,zip}
//   arch: aarch64 | x86_64 | armv7l | armv6l | i686
//   os:   darwin | linux | windows
const HIMALAYA_VERSION = 'v1.2.0';
const RELEASE_BASE = `https://github.com/pimalaya/himalaya/releases/download/${HIMALAYA_VERSION}`;

/** Map Node platform/arch → release asset descriptor. */
function platformAsset() {
  const platform = process.platform;
  const arch = process.arch; // 'x64' | 'arm64' | ...
  const isWin = platform === 'win32';
  const binName = isWin ? 'himalaya.exe' : 'himalaya';

  const osPart = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : platform === 'win32' ? 'windows' : null;
  if (!osPart) throw new Error(`Unsupported platform for himalaya: ${platform}/${arch}`);

  const archPart = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : arch === 'ia32' ? 'i686' : arch === 'arm' ? 'armv7l' : null;
  if (!archPart) throw new Error(`Unsupported architecture for himalaya: ${arch}`);

  // himalaya ships .tgz for every target (Windows also has .zip); use .tgz everywhere.
  const assetName = `himalaya.${archPart}-${osPart}.tgz`;

  return { url: `${RELEASE_BASE}/${assetName}`, assetName, binName, isArchiveZip: false };
}

function binDir() {
  const base = app ? app.getPath('userData') : path.join(os.homedir(), '.dome');
  return path.join(base, 'bin');
}

function downloadedBinaryPath() {
  return path.join(binDir(), platformAsset().binName);
}

/** Look for `himalaya` on PATH. Returns absolute path or null. */
function findOnPath() {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, ['himalaya'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Resolve an already-available binary without downloading. Returns path or null. */
function resolveExistingBinary(settingPath) {
  const override = process.env.DOME_HIMALAYA_PATH || settingPath;
  if (override && fs.existsSync(override)) return override;

  const downloaded = downloadedBinaryPath();
  if (fs.existsSync(downloaded)) return downloaded;

  return findOnPath();
}

/** Follow redirects and stream the body to `dest`. */
function downloadTo(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Too many redirects'));
    https
      .get(url, { headers: { 'User-Agent': 'Dome' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(downloadTo(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Extract an archive into `outDir` using the system `tar` (handles .tgz and .zip on Win10+/mac/linux). */
function extractArchive(archivePath, outDir) {
  return new Promise((resolve, reject) => {
    const args = archivePath.endsWith('.zip')
      ? ['-xf', archivePath, '-C', outDir]
      : ['-xzf', archivePath, '-C', outDir];
    execFile('tar', args, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Ensure a himalaya binary is available, downloading on demand.
 * @param {{ settingPath?: string, onProgress?: (pct:number)=>void }} [opts]
 * @returns {Promise<string>} absolute path to the binary
 */
async function ensureHimalaya(opts = {}) {
  const existing = resolveExistingBinary(opts.settingPath);
  if (existing) return existing;

  const asset = platformAsset();
  fs.mkdirSync(binDir(), { recursive: true });
  const tmp = path.join(binDir(), `.${asset.assetName}.download`);

  console.log(`[himalaya] downloading ${asset.url}`);
  await downloadTo(asset.url, tmp);
  await extractArchive(tmp, binDir());
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }

  const finalPath = downloadedBinaryPath();
  if (!fs.existsSync(finalPath)) {
    throw new Error(`himalaya binary not found after extraction at ${finalPath}`);
  }
  if (process.platform !== 'win32') {
    try { fs.chmodSync(finalPath, 0o755); } catch { /* ignore */ }
  }
  console.log(`[himalaya] ready at ${finalPath}`);
  return finalPath;
}

module.exports = {
  HIMALAYA_VERSION,
  platformAsset,
  resolveExistingBinary,
  ensureHimalaya,
  downloadedBinaryPath,
};
