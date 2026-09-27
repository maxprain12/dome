import { expect, it } from 'vitest';
import { featureAccess } from './access';
import type { CloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
const local: CloudEntitlements = { loading: false, error: false, connected: false, tier: 'local', subscribed: false, showCloudUi: false, hasCloudSync: false, hasSocialCloud: false, hasPipelinesCloud: false, planId: 'unsubscribed', planName: null, subscriptionStatus: 'unsubscribed', features: [] };
it('distinguishes each denial reason and grants capabilities, never plan names', () => {
  expect(featureAccess(local, 'cloud_sync')).toBe('account_required');
  expect(featureAccess({ ...local, loading: true }, 'cloud_sync')).toBe('loading');
  expect(featureAccess({ ...local, error: true }, 'cloud_sync')).toBe('unavailable');
  expect(featureAccess({ ...local, connected: true }, 'cloud_sync')).toBe('subscription_required');
  const paid = { ...local, connected: true, subscribed: true, planId: 'dome_pro' };
  expect(featureAccess(paid, 'cloud_sync')).toBe('feature_required');
  expect(featureAccess({ ...paid, features: ['social_cloud'] }, 'cloud_sync')).toBe('feature_required');
  expect(featureAccess({ ...paid, features: ['cloud_sync'] }, 'cloud_sync')).toBe('allowed');
});
