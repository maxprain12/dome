import { useCallback, useEffect, useRef, useState } from 'react';

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

  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!window.electron?.domeAuth?.getSession) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    const res = await window.electron.domeAuth.getSession().catch(() => null);
    if (request !== generation.current) return;
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
      generation.current += 1;
      setState((prev) => ({
        ...prev,
        loading: false,
        connected: Boolean(sessionState?.connected),
        userId: sessionState?.userId ?? null,
        expiresAt:
          typeof sessionState?.expiresAt === 'number' ? sessionState.expiresAt : null,
      }));
    });
    return () => { generation.current += 1; unsub?.(); };
  }, [refresh]);

  return { ...state, refresh };
}
