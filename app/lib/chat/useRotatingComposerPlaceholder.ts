import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_INTERVAL_MS = 4500;

export function useRotatingComposerPlaceholder(
  keys: readonly string[],
  options?: { enabled?: boolean; intervalMs?: number },
) {
  const { t, i18n } = useTranslation();
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const keysSignature = useMemo(() => keys.join('\0'), [keys]);
  const [index, setIndex] = useState(0);
  const resetKey = `${keysSignature}:${i18n.language}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setIndex(0);
  }

  useEffect(() => {
    if (!enabled || keys.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % keys.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, keys.length, intervalMs, keysSignature]);

  const safeIndex = keys.length ? index % keys.length : 0;
  return keys.length ? t(keys[safeIndex]!) : '';
}
