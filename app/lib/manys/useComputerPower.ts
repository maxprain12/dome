import { useCallback, useEffect, useState } from 'react';
import { request } from './api';

const POWER_POLL_MS = 15000;
export type Power = 'running' | 'stopped';

export interface ComputerPower {
  /** Null until the first answer. */
  power: Power | null;
  working: boolean;
  failed: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** Whether the computer is up, and a way to start or stop it. Looking at it never starts it. */
export function useComputerPower(manyId: string, enabled: boolean): ComputerPower {
  const [power, setPower] = useState<Power | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const apply = useCallback(async (operation: 'status' | 'start' | 'stop') => {
    setWorking(operation !== 'status');
    try {
      const result = await request<{ state?: Power }>(`/${manyId}/computer`, 'POST', { operation, parameters: {} });
      if (result.state === 'running' || result.state === 'stopped') setPower(result.state);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }, [manyId]);
  useEffect(() => {
    if (!enabled) return undefined;
    void apply('status');
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void apply('status'); }, POWER_POLL_MS);
    return () => clearInterval(timer);
  }, [apply, enabled]);
  return { power, working, failed, start: () => apply('start'), stop: () => apply('stop'), refresh: () => apply('status') };
}
