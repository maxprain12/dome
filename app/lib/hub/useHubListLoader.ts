'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseHubListLoaderOptions {
  /** Window event name that triggers a silent reload (e.g. dome:agents-changed). */
  eventName?: string;
}

/**
 * Hub list loader: skeleton only on first load / project change; silent refresh on events.
 */
export function useHubListLoader(
  loadFn: () => Promise<void>,
  deps: readonly unknown[],
  options?: UseHubListLoaderOptions,
) {
  const [initialLoading, setInitialLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const loadFnRef = useRef(loadFn);
  loadFnRef.current = loadFn;

  const reload = useCallback(async (opts?: { silent?: boolean; forceSkeleton?: boolean }) => {
    const silent = opts?.silent ?? hasLoadedRef.current;
    const showSkeleton = opts?.forceSkeleton ?? !silent;
    if (showSkeleton) setInitialLoading(true);
    try {
      await loadFnRef.current();
      hasLoadedRef.current = true;
    } finally {
      if (showSkeleton) setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    hasLoadedRef.current = false;
    void reload({ forceSkeleton: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the invalidation key
  }, deps);

  useEffect(() => {
    const eventName = options?.eventName;
    if (!eventName) return;
    const handler = () => void reload({ silent: true });
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [options?.eventName, reload]);

  return { initialLoading, reload };
}
