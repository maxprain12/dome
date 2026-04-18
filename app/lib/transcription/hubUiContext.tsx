import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'dome:hub-ui-minimized-v1';

export type HubUiContextValue = {
  hubMinimized: boolean;
  setHubMinimized: (value: boolean) => void;
  toggleHubMinimized: () => void;
  expandHub: () => void;
};

const HubUiContext = createContext<HubUiContextValue | null>(null);

export function HubUiProvider({ children }: { children: ReactNode }) {
  const [hubMinimized, setHubMinimizedState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setHubMinimized = useCallback((value: boolean) => {
    setHubMinimizedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      /* */
    }
  }, []);

  const toggleHubMinimized = useCallback(() => {
    setHubMinimizedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* */
      }
      return next;
    });
  }, []);

  const expandHub = useCallback(() => setHubMinimized(false), [setHubMinimized]);

  const value = useMemo(
    () => ({ hubMinimized, setHubMinimized, toggleHubMinimized, expandHub }),
    [hubMinimized, setHubMinimized, toggleHubMinimized, expandHub],
  );

  return <HubUiContext.Provider value={value}>{children}</HubUiContext.Provider>;
}

export function useHubUi(): HubUiContextValue | null {
  return useContext(HubUiContext);
}
