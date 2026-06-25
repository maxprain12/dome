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

  // Errors go to Sentry (single source of truth); always captured when Sentry is configured.
  const captureError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      captureExceptionSentry(error, context);
    },
    [],
  );

  return { track, captureError, ANALYTICS_EVENTS };
}
