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
 * Consent model (split):
 * - Errors / crashes: always sent when DSN is configured (observability, not product analytics).
 * - Performance spans: gated by the app's `analytics_enabled` toggle via `beforeSendTransaction`.
 *   Consent is synced from SQLite on startup (`syncSentryConsentFromDatabase`) and mirrored
 *   from the renderer via `sentry:set-consent` IPC when the user toggles settings.
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
      // Errors/crashes always leave the machine when DSN is set.
      beforeSend(event) {
        return event;
      },
      // Product-analytics consent gates performance spans only.
      beforeSendTransaction(event) {
        return consentEnabled ? event : null;
      },
    });
    initialized = true;
    console.log(`[Sentry] main process initialized → ${release || 'no release'} (spans consent pending)`);
  } catch (err) {
    console.warn('[Sentry] main init failed:', err?.message || err);
    Sentry = null;
    initialized = false;
  }
}

/**
 * Flip the performance-span consent gate. Called from SQLite sync on startup and
 * from the renderer (`sentry:set-consent`) when the user toggles analytics.
 * @param {boolean} enabled
 */
function setSentryConsent(enabled) {
  consentEnabled = !!enabled;
  if (initialized) {
    console.log(`[Sentry] span consent → ${consentEnabled ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Read `analytics_enabled` from SQLite and sync span consent before the renderer loads.
 * @param {{ getQueries: () => { getSetting: { get: (key: string) => { value?: string } | undefined } } }} database
 */
function syncSentryConsentFromDatabase(database) {
  if (!database || typeof database.getQueries !== 'function') return;
  try {
    const row = database.getQueries().getSetting.get('analytics_enabled');
    const enabled = !row || row.value === 'true' || row.value === undefined;
    setSentryConsent(enabled);
  } catch (err) {
    console.warn('[Sentry] consent sync from DB failed:', err?.message || err);
  }
}

function isSentryConsentEnabled() {
  return consentEnabled;
}

/**
 * Report a main-process error directly to Sentry (no-op unless initialized).
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
function captureExceptionMain(error, context) {
  if (!initialized || !Sentry) return;
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
  syncSentryConsentFromDatabase,
  isSentryConsentEnabled,
  captureExceptionMain,
  closeSentryMain,
};
