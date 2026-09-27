import type { CloudEntitlements, CloudFeature } from '@/lib/hooks/useCloudEntitlements';

export type AccessDecision = 'loading' | 'unavailable' | 'account_required' | 'subscription_required' | 'feature_required' | 'allowed';
export function featureAccess(access: CloudEntitlements, feature: CloudFeature): AccessDecision {
  if (access.loading) return 'loading';
  if (access.error) return 'unavailable';
  if (!access.connected) return 'account_required';
  if (!access.subscribed) return 'subscription_required';
  return access.features.includes(feature) ? 'allowed' : 'feature_required';
}
