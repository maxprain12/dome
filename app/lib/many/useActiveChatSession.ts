import { useLayoutEffect } from 'react';
import { useManyStore } from '@/lib/store/useManyStore';

/** Only the router's active chat selects the shared Many session. */
export function useActiveChatSession(sessionId: string | undefined): void {
  useLayoutEffect(() => {
    if (!sessionId) return;
    const store = useManyStore.getState();
    if (store.currentSessionId !== sessionId) store.switchSession(sessionId);
  }, [sessionId]);
}
