/**
 * React hook for PostHog analytics
 * Tracks events only when analytics is enabled
 */

import { useCallback } from 'react';
import {
  capturePostHog,
  captureExceptionPostHog,
  isPostHogConfigured,
} from './posthog';
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

  const captureError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      if (!canTrack) return;
      captureExceptionPostHog(error, context);
    },
    [canTrack]
  );

  return { track, captureError, ANALYTICS_EVENTS };
}
