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

// Sentry — errors, crashes and performance (single source of truth for errors).
export {
  initSentry,
  setSentryUser,
  captureExceptionSentry,
  shutdownSentry,
  isSentryConfigured,
} from './sentry';

export { ANALYTICS_EVENTS } from './events';
export type { AnalyticsEventName } from './events';

export { useAnalytics } from './useAnalytics';
