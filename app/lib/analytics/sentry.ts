/**
 * Sentry for the RENDERER process — errors and performance (Web Vitals).
 *
 * Mirrors the shape of `posthog.ts`. Sentry is the single source of truth for
 * errors/crashes; PostHog stays for product analytics (its own exception capture
 * is disabled to avoid duplicates).
 *
 * Events route through the main process via IPC (`@sentry/electron/renderer` +
 * the `@sentry/electron/preload` bridge), so the main-process SDK must be
 * initialized too (see electron/core/sentry-main.cjs).
 *
 * Consent model (split):
 * - Error capture: initialized whenever VITE_SENTRY_DSN is configured.
 * - Performance spans: gated by `analytics_enabled` (forwarded to main via IPC).
 * - Toggling analytics off stops spans but keeps error reporting active.
 */

import * as Sentry from '@sentry/electron/renderer';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function isSentryConfigured(): boolean {
  return !!DSN && DSN.length > 0 && !DSN.includes('...');
}

/** Forward span consent to the main process (performance only). */
function setMainSpanConsent(enabled: boolean): void {
  try {
    void window.electron?.invoke?.('sentry:set-consent', enabled);
  } catch {
    // ignore — main may not have Sentry configured
  }
}

function ensureRendererInitialized(analyticsEnabled: boolean): void {
  if (!isSentryConfigured() || initialized) return;

  try {
    Sentry.init({
      dsn: DSN!,
      environment: import.meta.env.PROD ? 'production' : 'development',
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: analyticsEnabled
        ? import.meta.env.PROD
          ? 0.2
          : 1.0
        : 0,
      sendDefaultPii: false,
    });
    initialized = true;
  } catch (error) {
    console.warn('[Analytics] Sentry init failed:', error);
  }
}

export function initSentry(analyticsEnabled: boolean): void {
  setMainSpanConsent(analyticsEnabled);
  ensureRendererInitialized(analyticsEnabled);
}

export function setSentryUser(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.setUser({ id: userId, ...(traits || {}) });
  } catch {
    // ignore
  }
}

export function captureExceptionSentry(
  error: Error,
  context?: Record<string, unknown>,
): void {
  // Lazy-init so manual captures work even if AnalyticsProvider hasn't mounted yet.
  ensureRendererInitialized(false);
  if (!initialized) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}

export function shutdownSentry(): void {
  // Stop performance spans; keep the client alive for error reporting.
  setMainSpanConsent(false);
}
