/**
 * PostHog analytics initialization for Dome (Electron)
 *
 * Uses the full bundle (module.full.no-external.js) as required by Electron
 * security restrictions - see https://posthog.com/tutorials/electron-analytics
 */

import posthog from 'posthog-js/dist/module.full.no-external.js';

const API_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const API_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://us.i.posthog.com';

let initialized = false;

export function isPostHogConfigured(): boolean {
  return !!API_KEY && API_KEY.length > 0 && !API_KEY.includes('...');
}

export async function initPostHog(analyticsEnabled: boolean): Promise<void> {
  if (!isPostHogConfigured() || !analyticsEnabled || initialized) {
    return;
  }

  try {
    posthog.init(API_KEY!, {
      api_host: API_HOST,
      person_profiles: 'identified_only',
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    });
    initialized = true;
  } catch (error) {
    console.warn('[Analytics] PostHog init failed:', error);
  }
}

export function identifyPostHog(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.identify(userId, traits);
  } catch {
    // ignore
  }
}

export function capturePostHog(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // ignore
  }
}

export function captureExceptionPostHog(
  error: Error,
  context?: Record<string, unknown>
): void {
  if (!initialized) return;
  try {
    posthog.captureException(error, context);
  } catch {
    // ignore
  }
}

export function shutdownPostHog(): void {
  if (!initialized) return;
  try {
    const client = posthog as { shutdown?: () => void };
    client.shutdown?.();
    initialized = false;
  } catch {
    // ignore
  }
}

export { posthog };
