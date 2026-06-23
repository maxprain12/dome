/* eslint-disable no-console */
/**
 * Sentry for the Electron MAIN process — errors, native crashes and performance.
 *
 * Covers the gaps PostHog (renderer-only) cannot: native crashes (`process.crash()`,
 * segfaults in native addons like better-sqlite3 / sharp / lancedb — the v2.6.0
 * class of failure), main-process exceptions reported directly, and tracing.
 *
 * Activation: set `SENTRY_DSN` (the DSN is public by design — it ships in clients).
 * If unset, every export here is a silent no-op (same pattern as observability.cjs).
 *
 * Consent: Sentry honours the app's existing `analytics_enabled` toggle. The main
 * process starts with consent OFF (privacy-safe, opt-in) and the renderer flips it on
 * via `setSentryConsent(true)` once it resolves the setting (see AnalyticsProvider +
 * the `sentry:set-consent` IPC). `beforeSend` drops every event while consent is OFF,
 * so nothing leaves the machine unless the user opted in.
 */

let Sentry = null; // lazy-required @sentry/electron/main
let initialized = false;
let consentEnabled = false;

// Build-time credentials baked by scripts/embed-env.cjs. In a packaged app
// process.env does NOT carry the CI build secrets, so the DSN must be read from
// here (same pattern as github-oauth.cjs / dome-provider-url.cjs). Absent in dev
// when embed-env hasn't run — that's fine, Sentry just stays a no-op.
let _appCredentials = {};
try {
  _appCredentials = require('../app-credentials.cjs');
} catch {
  // app-credentials.cjs not generated yet (dev without running embed-env.cjs)
}

function resolveDsn() {
  return _appCredentials.SENTRY_DSN || process.env.SENTRY_DSN || '';
}

function isProd(app) {
  try {
    return !!app && app.isPackaged === true;
  } catch {
    return false;
  }
}

/**
 * Initialize the main-process Sentry SDK as early as possible (before domain
 * modules load) so native-addon load failures are also captured.
 * @param {import('electron').App} app
 */
function initSentryMain(app) {
  if (initialized) return;
  const dsn = resolveDsn();
  if (!dsn) {
    // No DSN → stay a no-op. Don't warn (parity with Langfuse/PostHog).
    return;
  }

  try {
    Sentry = require('@sentry/electron/main');
    const release = app && typeof app.getVersion === 'function'
      ? `dome@${app.getVersion()}`
      : undefined;

    Sentry.init({
      dsn,
      release,
      environment: isProd(app) ? 'production' : 'development',
      // Performance tracing. Sample down in prod to control volume.
      tracesSampleRate: isProd(app) ? 0.2 : 1.0,
      // Never attach IP / cookies / user PII automatically.
      sendDefaultPii: false,
      // Consent gate: drop everything (incl. events built from native crashes)
      // until the user has opted in via the analytics toggle.
      beforeSend(event) {
        return consentEnabled ? event : null;
      },
    });
    initialized = true;
    console.log(`[Sentry] main process initialized → ${release || 'no release'} (consent pending)`);
  } catch (err) {
    console.warn('[Sentry] main init failed:', err?.message || err);
    Sentry = null;
    initialized = false;
  }
}

/**
 * Flip the consent gate. Called from the renderer (`sentry:set-consent`) once the
 * `analytics_enabled` setting is known, and whenever the user toggles it.
 * @param {boolean} enabled
 */
function setSentryConsent(enabled) {
  consentEnabled = !!enabled;
  if (initialized) {
    console.log(`[Sentry] consent → ${consentEnabled ? 'enabled' : 'disabled'}`);
  }
}

function isSentryConsentEnabled() {
  return consentEnabled;
}

/**
 * Report a main-process error directly to Sentry (no-op unless initialized AND consented).
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
function captureExceptionMain(error, context) {
  if (!initialized || !consentEnabled || !Sentry) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // capturing must never crash the caller (often an error handler itself)
  }
}

/**
 * Flush buffered events on shutdown.
 * @param {number} [timeoutMs]
 */
async function closeSentryMain(timeoutMs = 2000) {
  if (!initialized || !Sentry) return;
  try {
    await Sentry.close(timeoutMs);
  } catch (err) {
    console.warn('[Sentry] close failed:', err?.message || err);
  }
}

module.exports = {
  initSentryMain,
  setSentryConsent,
  isSentryConsentEnabled,
  captureExceptionMain,
  closeSentryMain,
};
