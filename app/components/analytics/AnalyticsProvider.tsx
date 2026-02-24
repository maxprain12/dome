/**
 * Analytics provider - initializes PostHog and forwards main-process events
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initPostHog,
  capturePostHog,
  captureExceptionPostHog,
  identifyPostHog,
  isPostHogConfigured,
} from '@/lib/analytics/posthog';
import { getAnalyticsEnabled, getUserProfile } from '@/lib/settings';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [analyticsActive, setAnalyticsActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;

    let unsub: (() => void) | undefined;

    const setup = async () => {
      try {
        const enabled = await getAnalyticsEnabled();

        if (!enabled || !isPostHogConfigured()) return;

        await initPostHog(enabled);
        setAnalyticsActive(true);

        const profile = await getUserProfile();
        if (profile.email) {
          identifyPostHog(profile.email, { name: profile.name });
        }

        unsub = window.electron.on(
          'analytics:event',
          (data: { event: string; properties?: Record<string, unknown> }) => {
            if (!data?.event) return;
            if (data.event === 'main_process_exception' && data.properties) {
              const { message, stack } = data.properties as { message?: string; stack?: string };
              const err = new Error(message || 'Unknown main process error');
              if (stack) err.stack = stack;
              captureExceptionPostHog(err, { source: 'main_process', ...data.properties });
            } else {
              capturePostHog(data.event, data.properties);
            }
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
      path: location.pathname,
      title: document.title,
    });
  }, [analyticsActive, location.pathname]);

  return <>{children}</>;
}
