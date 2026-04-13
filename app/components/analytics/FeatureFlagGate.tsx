import type { ReactNode } from 'react';
import { useFeatureFlagEnabled } from '@/lib/analytics/useFeatureFlag';

interface FeatureFlagGateProps {
  /** PostHog feature flag name (e.g. 'dome-cloud-ai') */
  flag: string;
  /** What to render when the flag is enabled */
  children: ReactNode;
  /** What to render when the flag is disabled or not yet loaded. Defaults to null. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on a PostHog feature flag.
 *
 * @example
 * <FeatureFlagGate flag="dome-new-onboarding" fallback={<OldOnboarding />}>
 *   <NewOnboarding />
 * </FeatureFlagGate>
 *
 * When PostHog is not initialized (analytics disabled), always renders the fallback.
 */
export function FeatureFlagGate({ flag, children, fallback = null }: FeatureFlagGateProps) {
  const isEnabled = useFeatureFlagEnabled(flag);
  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
