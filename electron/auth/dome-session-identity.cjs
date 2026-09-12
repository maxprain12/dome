'use strict';

/**
 * Shared identity helpers for Dome Provider token JSON + HMAC access tokens.
 * Kept free of Electron so unit tests can import it.
 */

class DomeSessionIdentityError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function extractUserIdFromDomeAccessToken(domeAccessToken) {
  const [encoded] = String(domeAccessToken).split('.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload?.sub) {
    throw new DomeSessionIdentityError('exchange_failed', 'Token de Dome sin identificador de usuario');
  }
  return payload.sub;
}

/** Prefer `user_id` from the provider token JSON; fall back to JWT `sub`. */
function resolveDomeUserId(domeSession) {
  if (typeof domeSession?.user_id === 'string' && domeSession.user_id.trim()) {
    return domeSession.user_id.trim();
  }
  return extractUserIdFromDomeAccessToken(domeSession.access_token);
}

module.exports = {
  extractUserIdFromDomeAccessToken,
  resolveDomeUserId,
};
