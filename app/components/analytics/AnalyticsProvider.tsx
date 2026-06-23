/**
 * Analytics provider - initializes PostHog and forwards main-process events
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initPostHog,
  capturePostHog,
  identifyPostHog,
  isPostHogConfigured,
} from '@/lib/analytics/posthog';
import { initSentry, setSentryUser } from '@/lib/analytics/sentry';
import { getAnalyticsEnabled, getUserProfile } from '@/lib/settings';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { pathname: routePathname } = useLocation();
  const [analyticsActive, setAnalyticsActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;

    let unsub: (() => void) | undefined;

    const setup = async () => {
      try {
        const enabled = await getAnalyticsEnabled();

        // Sentry (errors/crashes/perf) — also forwards consent to the main process.
        // Honours the same opt-in; a disabled call gates the main-process SDK off.
        initSentry(enabled);

        if (!enabled) return;

        // PostHog (product analytics) — independent of Sentry being configured.
        const posthogReady = isPostHogConfigured();
        if (posthogReady) {
          await initPostHog(enabled);
          setAnalyticsActive(true);
        }

        const profile = await getUserProfile();
        if (profile.email) {
          setSentryUser(profile.email, { name: profile.name });
          if (posthogReady) identifyPostHog(profile.email, { name: profile.name });
        }

        unsub = window.electron.on(
          'analytics:event',
          (data: { event: string; properties?: Record<string, unknown> }) => {
            if (!data?.event) return;
            // Main-process exceptions are reported to Sentry directly from the main
            // process now — skip here to avoid duplicates. Forward everything else
            // (product events) to PostHog.
            if (data.event === 'main_process_exception') return;
            if (posthogReady) capturePostHog(data.event, data.properties);
          }
        );
      } catch (err) {
        console.warn('[Analytics] Setup failed:', err);
      }
    };

    setup();
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!analyticsActive) return;
    capturePostHog(ANALYTICS_EVENTS.PAGEVIEW, {
      path: routePathname,
      title: document.title,
    });
  }, [analyticsActive, routePathname]);

  return <>{children}</>;
}
