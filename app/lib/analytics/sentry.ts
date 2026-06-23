/**
 * Sentry for the RENDERER process — errors and performance (Web Vitals).
 *
 * Mirrors the shape of `posthog.ts`. Sentry is the single source of truth for
 * errors/crashes/performance; PostHog stays for product analytics (its own
 * exception capture is disabled to avoid duplicates).
 *
 * Events route through the main process via IPC (`@sentry/electron/renderer` +
 * the `@sentry/electron/preload` bridge), so the main-process SDK must be
 * initialized too (see electron/core/sentry-main.cjs).
 *
 * Consent: only initialized when the `analytics_enabled` toggle is on, and the
 * same consent value is forwarded to the main process so its native-crash / error
 * capture honours the opt-in. Toggling off calls `shutdownSentry()`.
 */

import * as Sentry from '@sentry/electron/renderer';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function isSentryConfigured(): boolean {
  return !!DSN && DSN.length > 0 && !DSN.includes('...');
}

/** Forward consent to the main process so its SDK gates events the same way. */
function setMainConsent(enabled: boolean): void {
  try {
    void window.electron?.invoke?.('sentry:set-consent', enabled);
  } catch {
    // ignore — main may not have Sentry configured
  }
}

export function initSentry(analyticsEnabled: boolean): void {
  // Always sync main-process consent, even if the renderer SDK isn't configured.
  setMainConsent(analyticsEnabled);

  if (!isSentryConfigured() || !analyticsEnabled || initialized) {
    return;
  }

  try {
    Sentry.init({
      dsn: DSN!,
      environment: import.meta.env.PROD ? 'production' : 'development',
      // Performance: page-load + navigation spans and Web Vitals.
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
      sendDefaultPii: false,
    });
    initialized = true;
  } catch (error) {
    console.warn('[Analytics] Sentry init failed:', error);
  }
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
  if (!initialized) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}

export function shutdownSentry(): void {
  // Revoke consent in the main process so it stops sending too.
  setMainConsent(false);
  if (!initialized) return;
  try {
    void Sentry.getClient()?.close();
    Sentry.setUser(null);
    initialized = false;
  } catch {
    // ignore
  }
}
