/* eslint-disable no-console */
'use strict';

/**
 * Resolve spawn-safe ffmpeg/ffprobe paths in packaged Electron builds.
 *
 * @ffmpeg-installer resolves binaries relative to `__dirname`. When the package
 * is loaded from `app.asar`, the returned path points inside the asar archive
 * (`…/app.asar/node_modules/…/ffmpeg`). macOS cannot execute that path and
 * `child_process.spawn` fails with ENOTDIR — often as an uncaught async error
 * from fluent-ffmpeg's capability probe, which aborts the main process.
 *
 * The real binaries live in `app.asar.unpacked` (electron-builder unpacks native
 * assets there). Rewrite the path when the unpacked binary exists.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} absPath
 * @returns {string}
 */
function toSpawnSafePath(absPath) {
  if (!absPath || typeof absPath !== 'string') return absPath;
  const marker = `${path.sep}app.asar${path.sep}`;
  const unpackedMarker = `${path.sep}app.asar.unpacked${path.sep}`;
  if (!absPath.includes(marker) || absPath.includes(unpackedMarker)) {
    return absPath;
  }
  const candidate = absPath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* ignore */
  }
  // Packaged builds should always prefer the unpacked path even if the check fails
  // (e.g. race during first boot); spawning the asar path always fails with ENOTDIR.
  return candidate;
}

/**
 * @returns {{ ffmpegPath: string, ffprobePath: string, version?: string } | null}
 */
function getFfmpegInstallerPaths() {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = toSpawnSafePath(installer.path);
    const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const ffprobePath = toSpawnSafePath(path.join(path.dirname(ffmpegPath), probeName));
    return {
      ffmpegPath,
      ffprobePath,
      version: installer.version,
    };
  } catch (err) {
    console.warn('[ffmpeg-paths] @ffmpeg-installer unavailable:', err?.message || err);
    return null;
  }
}

/**
 * Configure a fluent-ffmpeg module export with spawn-safe binary paths.
 * @param {typeof import('fluent-ffmpeg')} fluent
 * @returns {boolean} false when ffmpeg binary is missing
 */
function configureFluentFfmpeg(fluent) {
  const paths = getFfmpegInstallerPaths();
  if (!paths) return false;
  fluent.setFfmpegPath(paths.ffmpegPath);
  try {
    if (fs.existsSync(paths.ffprobePath)) {
      fluent.setFfprobePath(paths.ffprobePath);
    }
  } catch {
    /* ffprobe optional for some code paths */
  }
  return fs.existsSync(paths.ffmpegPath);
}

module.exports = {
  toSpawnSafePath,
  getFfmpegInstallerPaths,
  configureFluentFfmpeg,
};
