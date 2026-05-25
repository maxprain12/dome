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
  const [index, setIndex] = useState(0);

  const keysSignature = useMemo(() => keys.join('\0'), [keys]);

  useEffect(() => {
    setIndex(0);
  }, [keysSignature, i18n.language]);

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
