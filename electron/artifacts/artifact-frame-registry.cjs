'use strict';

/* eslint-disable no-console */

/**
 * In-memory registry that backs the `app://artifact/<token>` frame URLs.
 *
 * Why it exists: sandboxed iframes rendered via `srcdoc` (or `blob:`/`data:`)
 * INHERIT the embedding document's Content-Security-Policy. In packaged builds
 * the renderer CSP is `script-src 'self'`, so every inline <script> inside an
 * artifact srcdoc is silently blocked — artifacts render empty in production
 * while working in dev (whose CSP includes 'unsafe-inline'). Issue #465.
 *
 * Serving the artifact document from a real URL gives it its OWN response CSP
 * (see `ARTIFACT_FRAME_CSP` in core/csp.cjs) while the iframe `sandbox`
 * attribute keeps it in an opaque origin with no IPC/DOM access to the app.
 *
 * Tokens are unguessable (128-bit) and entries expire; the renderer registers
 * a frame right before rendering and releases it on unmount.
 */

const crypto = require('crypto');

const MAX_ENTRIES = 300;
const TTL_MS = 60 * 60 * 1000; // frames are re-registered on every iframe rebuild

/** @type {Map<string, { html: string, at: number }>} */
const frames = new Map();

function sweep() {
  const now = Date.now();
  for (const [token, entry] of frames) {
    if (now - entry.at > TTL_MS) frames.delete(token);
  }
  // Drop oldest entries beyond the cap (Map preserves insertion order).
  while (frames.size > MAX_ENTRIES) {
    const oldest = frames.keys().next().value;
    frames.delete(oldest);
  }
}

/**
 * @param {string} html Full HTML document to serve.
 * @returns {{ token: string, url: string }}
 */
function registerFrameHtml(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Frame html must be a non-empty string');
  }
  sweep();
  const token = crypto.randomBytes(16).toString('hex');
  frames.set(token, { html, at: Date.now() });
  return { token, url: `app://artifact/${token}` };
}

/** @param {string} token */
function releaseFrame(token) {
  return frames.delete(String(token || ''));
}

/** @param {string} token @returns {string|null} */
function getFrameHtml(token) {
  const entry = frames.get(String(token || ''));
  if (!entry) return null;
  entry.at = Date.now(); // keep alive while in use (reloads, devtools)
  return entry.html;
}

module.exports = { registerFrameHtml, releaseFrame, getFrameHtml };
