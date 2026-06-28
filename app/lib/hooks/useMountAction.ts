import { useCallback, useRef } from 'react';

/**
 * Run an action once when the host element mounts.
 * Parent must remount via key when inputs change (e.g. key={resourceId}).
 */
export function useMountAction(action: () => void | Promise<void>) {
  const ranRef = useRef(false);
  const actionRef = useRef(action);
  actionRef.current = action;

  return useCallback((node: HTMLElement | null) => {
    if (!node || ranRef.current) return;
    ranRef.current = true;
    void actionRef.current();
  }, []);
}
