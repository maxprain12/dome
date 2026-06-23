'use strict';

/* eslint-disable no-console */

/**
 * Proactive main-process memory monitoring.
 *
 * Context: the GitHub sync path (`getAllPages` → `streamPages`, broadcast
 * fan-out, image cache, run-contexts map) could spike the V8 heap past its
 * limit and crash the app with no warning. Sentry only captured the crash
 * post-mortem. This module:
 *   - snapshots `process.memoryUsage()` + (when available) Electron's
 *     app.getAppMemoryInfo() so callers can query current pressure;
 *   - lets the GitHub sync scheduler skip a tick under high pressure instead
 *     of OOMing (graceful degradation);
 *   - logs periodic snapshots so heap growth is visible in logs before a crash.
 *
 * It is intentionally dependency-free and never throws.
 */

const DEFAULT_INTERVAL_MS = 60 * 1000; // 1 min snapshot
// Skip heavyweight background work when heapUsed exceeds this fraction of
// heapTotal. 0.85 leaves headroom for the GC to catch up. Conservative on
// purpose: better to skip one sync tick than to crash the whole app.
const DEFAULT_PRESSURE_THRESHOLD = 0.85;
// Absolute floor (MB): below this heapUsed we never consider it "high pressure"
// even if the ratio is high. A fresh V8 heap is small (~64MB) and naturally sits
// at 90%+ used after startup — that is NOT real pressure. Real OOM risk starts
// at hundreds of MB. This prevents false positives that would skip syncs and
// spam logs on machines where V8 hasn't expanded the heap yet.
const PRESSURE_ABSOLUTE_FLOOR_MB = 200;

let _intervalId = null;
let _lastSnapshot = null;
let _threshold = DEFAULT_PRESSURE_THRESHOLD;

function snapshot() {
  const mu = process.memoryUsage();
  const info = {
    timestamp: Date.now(),
    rss: mu.rss,
    heapUsed: mu.heapUsed,
    heapTotal: mu.heapTotal,
    external: mu.external,
    arrayBuffers: mu.arrayBuffers,
    heapUsedRatio: mu.heapTotal > 0 ? mu.heapUsed / mu.heapTotal : 0,
  };
  // Electron ships app.getAppMemoryInfo() on recent versions; use it if present
  // to also surface per-webContents memory (helps diagnosing renderer-side growth).
  try {
    const { app } = require('electron');
    if (typeof app?.getAppMemoryInfo === 'function') {
      // getAppMemoryInfo is async in some Electron versions; guard with Promise.
      const maybe = app.getAppMemoryInfo();
      if (maybe && typeof maybe.then === 'function') {
        maybe.then((v) => { info.appMemoryInfo = v; }).catch(() => {});
      } else {
        info.appMemoryInfo = maybe;
      }
    }
  } catch {
    /* not available in this Electron / not in main — ignore */
  }
  _lastSnapshot = info;
  return info;
}

function getMemoryInfo() {
  return _lastSnapshot ?? snapshot();
}

/** True when heapUsed/heapTotal is above the threshold AND heapUsed exceeds
 *  the absolute floor. The floor prevents false positives on a fresh, small
 *  V8 heap (e.g. 59MB/63MB after startup = 94% ratio but zero real pressure). */
function isMemoryPressureHigh() {
  const s = getMemoryInfo();
  const heapUsedMB = s.heapUsed / 1024 / 1024;
  return s.heapUsedRatio >= _threshold && heapUsedMB >= PRESSURE_ABSOLUTE_FLOOR_MB;
}

function setPressureThreshold(ratio) {
  if (typeof ratio === 'number' && ratio > 0 && ratio <= 1) _threshold = ratio;
}

function startMemoryMonitor(intervalMs = DEFAULT_INTERVAL_MS) {
  if (_intervalId) return;
  // Take an immediate snapshot so getMemoryInfo() is populated before the
  // first tick (the GitHub scheduler may query it right away).
  snapshot();
  _intervalId = setInterval(() => {
    try {
      const s = snapshot();
      const heapUsedMB = s.heapUsed / 1024 / 1024;
      // Only warn when BOTH the ratio and the absolute floor are exceeded —
      // a small fresh heap at 90% ratio is normal, not a warning condition.
      if (s.heapUsedRatio >= _threshold && heapUsedMB >= PRESSURE_ABSOLUTE_FLOOR_MB) {
        console.warn(
          `[memory-monitor] high pressure: heapUsed ${(s.heapUsedRatio * 100).toFixed(1)}% of heapTotal ` +
          `(${heapUsedMB.toFixed(0)}MB / ${(s.heapTotal / 1024 / 1024).toFixed(0)}MB), rss ${(s.rss / 1024 / 1024).toFixed(0)}MB`,
        );
      }
    } catch {
      /* monitoring must never crash the host */
    }
  }, intervalMs);
  // Don't keep the process alive solely for monitoring.
  if (_intervalId.unref) _intervalId.unref();
}

function stopMemoryMonitor() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = {
  snapshot,
  getMemoryInfo,
  isMemoryPressureHigh,
  setPressureThreshold,
  startMemoryMonitor,
  stopMemoryMonitor,
};
