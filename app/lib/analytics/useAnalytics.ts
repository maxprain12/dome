/**
 * React hook for PostHog analytics
 * Tracks events only when analytics is enabled
 */

import { useCallback } from 'react';
import {
  capturePostHog,
  isPostHogConfigured,
} from './posthog';
import { captureExceptionSentry } from './sentry';
import { ANALYTICS_EVENTS } from './events';

export function useAnalytics(enabled: boolean) {
  const canTrack = enabled && isPostHogConfigured();

  const track = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      if (!canTrack) return;
      capturePostHog(event, properties);
    },
    [canTrack]
  );

  // Errors go to Sentry (single source of truth); no-ops unless Sentry is initialized.
  const captureError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      if (!enabled) return;
      captureExceptionSentry(error, context);
    },
    [enabled]
  );

  return { track, captureError, ANALYTICS_EVENTS };
}
