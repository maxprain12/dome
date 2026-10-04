import { useCallback, useEffect, useState } from 'react';
import { request } from './api';

export type Wheel = 'many' | 'you' | 'handback';

/**
 * Who holds the computer. The server says who had it at the last refresh; a person's own take and
 * hand-back show at once. `resync` takes the wheel again without touching anything else: the
 * computer can forget a take (a restart) while the server still remembers it.
 */
export function useComputerControl(manyId: string, serverControl: string) {
  const [held, setHeld] = useState(serverControl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setHeld(serverControl);
  }, [serverControl]);

  const call = useCallback(async (operation: 'enter' | 'leave', next: string): Promise<boolean> => {
    setBusy(true);
    try {
      await request(`/${manyId}/computer`, 'POST', { operation, parameters: {} });
      setHeld(next);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
      return false;
    } finally {
      setBusy(false);
    }
  }, [manyId]);

  const wheel: Wheel = held === 'human' ? 'you' : held === 'snapshot_required' ? 'handback' : 'many';
  return {
    wheel,
    human: wheel === 'you',
    busy,
    error,
    take: () => call('enter', 'human'),
    release: () => call('leave', 'snapshot_required'),
    /** Quietly asks again for a wheel the person already holds. */
    resync: () => call('enter', 'human'),
    clearError: () => setError(''),
  };
}
