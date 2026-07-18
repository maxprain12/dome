import { useCallback, useEffect, useState } from 'react';

export type DomeSessionState = {
  loading: boolean;
  connected: boolean;
  userId: string | null;
  expiresAt: number | null;
};

const DEFAULT: DomeSessionState = {
  loading: true,
  connected: false,
  userId: null,
  expiresAt: null,
};

export function useDomeSession(): DomeSessionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<DomeSessionState>(DEFAULT);

  const refresh = useCallback(async () => {
    if (!window.electron?.domeAuth?.getSession) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    const res = await window.electron.domeAuth.getSession();
    setState({
      loading: false,
      connected: Boolean(res?.connected),
      userId: res?.userId ?? null,
      expiresAt: typeof res?.expiresAt === 'number' ? res.expiresAt : null,
    });
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = window.electron?.domeAuth?.onSessionState?.((sessionState) => {
      setState((prev) => ({
        ...prev,
        loading: false,
        connected: Boolean(sessionState?.connected),
        userId: sessionState?.userId ?? null,
        expiresAt:
          typeof sessionState?.expiresAt === 'number' ? sessionState.expiresAt : null,
      }));
    });
    return () => unsub?.();
  }, [refresh]);

  return { ...state, refresh };
}
