import { useCallback, useEffect, useState } from 'react';

export type CloudEntitlements = {
  loading: boolean;
  subscribed: boolean;
  showCloudUi: boolean;
  hasCloudSync: boolean;
  hasSocialCloud: boolean;
  hasPipelinesCloud: boolean;
  planId: string;
  subscriptionStatus: string;
  features: string[];
};

const DEFAULT: CloudEntitlements = {
  loading: true,
  subscribed: false,
  showCloudUi: false,
  hasCloudSync: false,
  hasSocialCloud: false,
  hasPipelinesCloud: false,
  planId: 'unsubscribed',
  subscriptionStatus: 'unsubscribed',
  features: [],
};

export function useCloudEntitlements(): CloudEntitlements {
  const [state, setState] = useState<CloudEntitlements>(DEFAULT);

  const load = useCallback(async () => {
    if (!window.electron?.domainSync?.getEntitlements) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    const res = await window.electron.domainSync.getEntitlements();
    if (!res?.success) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    setState({
      loading: false,
      subscribed: Boolean(res.subscribed),
      showCloudUi: Boolean(res.showCloudUi),
      hasCloudSync: Boolean(res.hasCloudSync),
      hasSocialCloud: Boolean(res.hasSocialCloud),
      hasPipelinesCloud: Boolean(res.hasPipelinesCloud),
      planId: res.planId ?? 'unsubscribed',
      subscriptionStatus: res.subscriptionStatus ?? 'unsubscribed',
      features: Array.isArray(res.features) ? res.features : [],
    });
  }, []);

  useEffect(() => {
    void load();
    const unsubSession = window.electron?.domeAuth?.onSessionState?.(() => {
      void load();
    });
    return () => unsubSession?.();
  }, [load]);

  return state;
}
