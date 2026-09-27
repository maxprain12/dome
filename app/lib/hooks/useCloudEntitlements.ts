import { useCallback, useEffect, useRef, useState } from 'react';

export type AccessTier = 'local' | 'account' | 'subscription';
export type CloudFeature = 'cloud_sync' | 'social_cloud' | 'pipelines_cloud';
export type CloudEntitlements = {
  loading: boolean;
  error: boolean;
  connected: boolean;
  tier: AccessTier;
  subscribed: boolean;
  showCloudUi: boolean;
  hasCloudSync: boolean;
  hasSocialCloud: boolean;
  hasPipelinesCloud: boolean;
  planId: string;
  planName: string | null;
  subscriptionStatus: string;
  features: string[];
};

const DEFAULT: CloudEntitlements = {
  loading: true, error: false, connected: false, tier: 'local',
  subscribed: false, showCloudUi: false, hasCloudSync: false,
  hasSocialCloud: false, hasPipelinesCloud: false,
  planId: 'unsubscribed', planName: null, subscriptionStatus: 'unsubscribed', features: [],
};

/** Fail closed while refreshing and discard responses from an earlier session. */
export function useCloudEntitlements(): CloudEntitlements & { refresh: () => Promise<void> } {
  const [state, setState] = useState<CloudEntitlements>(DEFAULT);
  const generation = useRef(0);
  const load = useCallback(async (forceRefresh = false) => {
    const request = ++generation.current;
    setState({ ...DEFAULT });
    try {
      if (!window.electron?.domainSync?.getEntitlements) throw new Error('unavailable');
      const res = await window.electron.domainSync.getEntitlements({ forceRefresh });
      if (request !== generation.current) return;
      if (!res.success || res.fetchOk === false) throw new Error('unavailable');
      const connected = res.connected === true;
      const subscribed = connected && res.subscribed === true;
      const features = subscribed && Array.isArray(res.features) ? res.features : [];
      setState({
        loading: false, error: false, connected,
        tier: connected ? (subscribed ? 'subscription' : 'account') : 'local',
        subscribed, showCloudUi: ['cloud_sync', 'social_cloud', 'pipelines_cloud'].some((f) => features.includes(f)),
        hasCloudSync: features.includes('cloud_sync'), hasSocialCloud: features.includes('social_cloud'),
        hasPipelinesCloud: features.includes('pipelines_cloud'), planId: res.planId ?? 'unsubscribed',
        planName: res.planName ?? null, subscriptionStatus: res.subscriptionStatus ?? 'unknown', features,
      });
    } catch {
      if (request === generation.current) setState({ ...DEFAULT, loading: false, error: true });
    }
  }, []);
  const refresh = useCallback(() => load(true), [load]);
  useEffect(() => {
    void load();
    const unsub = window.electron?.domeAuth?.onSessionState?.(() => { void refresh(); });
    // Billing happens in the browser: revalidate on return without polling.
    window.addEventListener('focus', refresh);
    return () => { generation.current += 1; unsub?.(); window.removeEventListener('focus', refresh); };
  }, [load, refresh]);
  return { ...state, refresh };
}
