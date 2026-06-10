/**
 * Content-Security-Policy for the main renderer window (app:// and dev server).
 */

const { session } = require('electron');

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
      "frame-src 'self' blob:",
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
    "frame-src 'self' blob:",
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
};
