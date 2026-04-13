/**
 * Analytics module - PostHog integration for Dome
 */

export {
  initPostHog,
  identifyPostHog,
  capturePostHog,
  captureExceptionPostHog,
  shutdownPostHog,
  isPostHogConfigured,
} from './posthog';

export { ANALYTICS_EVENTS } from './events';
export type { AnalyticsEventName } from './events';

export { useAnalytics } from './useAnalytics';

export { useFeatureFlag, useFeatureFlagEnabled } from './useFeatureFlag';
