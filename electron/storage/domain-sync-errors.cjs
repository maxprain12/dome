'use strict';

/**
 * Unwrap undici "fetch failed" for Domain Sync and keep an in-memory lastError
 * + transport backoff so a down Dome Provider does not spam every 60s tick.
 */

const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;

/**
 * @param {unknown} text
 */
function isOpaqueConnectionMessage(text) {
  return /^(connection error\.?|fetch failed)$/i.test(String(text || '').trim());
}

/**
 * @param {unknown} err
 * @returns {{ message: string, code: string, causeObj: object | null }}
 */
function unwrapFetchError(err) {
  const error = err && typeof err === 'object' ? err : { message: String(err) };
  const cause = 'cause' in error ? error.cause : undefined;
  const causeObj = cause && typeof cause === 'object' ? cause : null;
  const code = String(
    (causeObj && 'code' in causeObj ? causeObj.code : null) ||
      ('code' in error ? error.code : '') ||
      '',
  );
  const message =
    'message' in error && error.message ? String(error.message) : String(err || '');
  return { message, code, causeObj };
}

/**
 * @param {unknown} err
 */
function isTransportFailure(err) {
  const { message, code } = unwrapFetchError(err);
  if (isOpaqueConnectionMessage(message)) return true;
  return /^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)$/.test(
    code,
  );
}

/**
 * @param {unknown} err
 * @param {string} [url]
 */
function formatDomainSyncError(err, url) {
  const { message, code, causeObj } = unwrapFetchError(err);
  const host = url || 'Dome Provider';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `Could not resolve the host for ${host}.`;
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `Timed out connecting to Dome Provider at ${host}.`;
  }
  if (code === 'ECONNRESET') {
    return `Connection reset by Dome Provider at ${host}.`;
  }
  if (code === 'ECONNREFUSED' || code === 'UND_ERR_SOCKET' || isOpaqueConnectionMessage(message)) {
    const suffix = code && !isOpaqueConnectionMessage(code) ? ` (${code})` : '';
    return `Dome Provider is not reachable at ${host}${suffix}.`;
  }
  const detail =
    (causeObj && 'message' in causeObj && causeObj.message) ||
    (causeObj && 'code' in causeObj && causeObj.code) ||
    message ||
    String(err);
  if (detail === 'fetch failed' && causeObj && 'code' in causeObj) {
    return `Could not reach Dome Provider at ${host} (${causeObj.code}).`;
  }
  return String(detail).slice(0, 300);
}

/**
 * @returns {{
 *   shouldSkip: (domain: string, now?: number) => boolean,
 *   recordSuccess: (domain: string) => void,
 *   recordFailure: (domain: string, message: string, opts?: { transport?: boolean }, now?: number) => void,
 *   getLastError: (domain: string) => string | null,
 *   getAllLastErrors: () => Record<string, string>,
 *   reset: () => void,
 * }}
 */
function createDomainErrorTracker() {
  /** @type {Map<string, { lastError: string, retryAt: number, delayMs: number }>} */
  const state = new Map();

  return {
    shouldSkip(domain, now = Date.now()) {
      const row = state.get(domain);
      return Boolean(row && row.retryAt > now);
    },
    recordSuccess(domain) {
      state.delete(domain);
    },
    recordFailure(domain, message, opts = {}, now = Date.now()) {
      const transport = Boolean(opts.transport);
      const prev = state.get(domain);
      const delayMs = transport
        ? Math.min(prev?.delayMs ? prev.delayMs * 2 : BACKOFF_MIN_MS, BACKOFF_MAX_MS)
        : 0;
      state.set(domain, {
        lastError: String(message || 'sync failed').slice(0, 300),
        retryAt: transport ? now + delayMs : 0,
        delayMs: transport ? delayMs : BACKOFF_MIN_MS,
      });
    },
    getLastError(domain) {
      return state.get(domain)?.lastError || null;
    },
    getAllLastErrors() {
      /** @type {Record<string, string>} */
      const out = {};
      for (const [domain, row] of state.entries()) {
        out[domain] = row.lastError;
      }
      return out;
    },
    reset() {
      state.clear();
    },
  };
}

const domainErrorTracker = createDomainErrorTracker();

module.exports = {
  BACKOFF_MIN_MS,
  BACKOFF_MAX_MS,
  isOpaqueConnectionMessage,
  isTransportFailure,
  formatDomainSyncError,
  createDomainErrorTracker,
  domainErrorTracker,
};
