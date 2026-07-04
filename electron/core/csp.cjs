/**
 * Content-Security-Policy for the main renderer window (app:// and dev server).
 */

const { session } = require('electron');

/**
 * CSP for sandboxed artifact frames served from `app://artifact/<token>`.
 *
 * srcdoc/blob/data documents inherit the PARENT document's CSP, whose packaged
 * `script-src 'self'` blocks every inline <script> of an artifact (issue #465).
 * Serving frames from a real URL lets us attach this dedicated policy instead:
 * inline scripts/styles and https CDNs (Chart.js, D3…) are allowed, while the
 * iframe `sandbox` attribute (no allow-same-origin) keeps the document in an
 * opaque origin with zero access to app internals, IPC or cookies.
 */
const ARTIFACT_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'font-src data: https:',
  'connect-src data: blob: https:',
  'media-src data: blob: https:',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
].join('; ');

function isArtifactFrameUrl(url) {
  return typeof url === 'string' && url.startsWith('app://artifact/');
}

function buildCsp(isDev) {
  const googleFontsStyle = 'https://fonts.googleapis.com';
  const googleFontsFiles = 'https://fonts.gstatic.com';

  if (isDev) {
    return [
      "default-src 'self' http://localhost:* ws://localhost:*",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      `style-src 'self' 'unsafe-inline' ${googleFontsStyle}`,
      "img-src 'self' app: data: blob: https: http://localhost:*",
      "media-src 'self' app: blob: http://localhost:*",
      // data:/blob: required — viewers fetch() resource payloads returned as data URLs
      "connect-src 'self' data: blob: http://localhost:* ws://localhost:* https: wss:",
      `font-src 'self' data: ${googleFontsFiles}`,
      "object-src 'none'",
      "base-uri 'self'",
      // app: → sandboxed artifact frames (app://artifact/<token>)
      "frame-src 'self' blob: app:",
    ].join('; ');
  }

  return [
    "default-src 'self' app:",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline' ${googleFontsStyle}`,
    "img-src 'self' app: data: blob: https:",
    "media-src 'self' app: blob:",
    "connect-src 'self' app: data: blob: https: wss:",
    `font-src 'self' data: ${googleFontsFiles}`,
    "object-src 'none'",
    "base-uri 'self'",
    // app: → sandboxed artifact frames (app://artifact/<token>)
    "frame-src 'self' blob: app:",
  ].join('; ');
}

function isMainDocumentUrl(url, isDev) {
  if (url.startsWith('app://')) return true;
  if (isDev && /^https?:\/\/localhost(:\d+)?\//.test(url)) return true;
  return false;
}

function setupContentSecurityPolicy(isDev) {
  const csp = buildCsp(isDev);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Artifact frames carry their own dedicated CSP — never the renderer one.
    if (isArtifactFrameUrl(details.url)) {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Content-Security-Policy'] = [ARTIFACT_FRAME_CSP];
      callback({ responseHeaders });
      return;
    }

    if (!isMainDocumentUrl(details.url, isDev)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

module.exports = {
  setupContentSecurityPolicy,
  buildCsp,
  ARTIFACT_FRAME_CSP,
  isArtifactFrameUrl,
};
