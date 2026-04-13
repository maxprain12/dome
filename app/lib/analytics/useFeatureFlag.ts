import { useEffect, useState } from 'react';
import { posthog } from './posthog';

/**
 * Returns the value of a PostHog feature flag.
 *
 * - Returns `undefined` if PostHog is not initialized (analytics disabled).
 * - Returns `true`/`false` for boolean flags.
 * - Returns a string for multivariate flags.
 * - Re-renders when the flag value changes (e.g., after PostHog loads flags from the network).
 *
 * @example
 * const isEnabled = useFeatureFlag('dome-cloud-ai');
 * if (!isEnabled) return <LegacyComponent />;
 */
export function useFeatureFlag(flagName: string): boolean | string | undefined {
  const [value, setValue] = useState<boolean | string | undefined>(() => {
    try {
      const flag = posthog.getFeatureFlag(flagName);
      return flag as boolean | string | undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    let mounted = true;

    // Subscribe to feature flag changes (fires after PostHog loads flags from network)
    const unsubscribe = posthog.onFeatureFlags(() => {
      if (!mounted) return;
      try {
        const flag = posthog.getFeatureFlag(flagName);
        setValue(flag as boolean | string | undefined);
      } catch {
        setValue(undefined);
      }
    });

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [flagName]);

  return value;
}

/**
 * Returns true if a boolean PostHog feature flag is enabled.
 * Convenience wrapper over useFeatureFlag for boolean flags.
 */
export function useFeatureFlagEnabled(flagName: string): boolean {
  const value = useFeatureFlag(flagName);
  return value === true || value === 'true';
}
