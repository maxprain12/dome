/**
 * useSourceTitles Hook
 *
 * Fetches resource titles for a list of source IDs.
 * Used to display source attribution for studio outputs.
 */

import { useEffect, useState, useMemo } from 'react';

const cache = new Map<string, string>();

export function useSourceTitles(sourceIds: string[]): {
  titles: Map<string, string>;
  isLoading: boolean;
} {
  const [loaded, setLoaded] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const ids = useMemo(
    () => (Array.isArray(sourceIds) ? sourceIds : []).filter((id) => id && typeof id === 'string'),
    [sourceIds]
  );

  useEffect(() => {
    if (ids.length === 0) {
      setLoaded(new Map());
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const results = new Map<string, string>();

      for (const id of ids) {
        if (cancelled) return;

        const cached = cache.get(id);
        if (cached) {
          results.set(id, cached);
          continue;
        }

        try {
          if (typeof window === 'undefined' || !window.electron?.db?.resources?.getById) break;
          const result = await window.electron.db.resources.getById(id);
          if (result.success && result.data?.title) {
            const title = result.data.title as string;
            cache.set(id, title);
            results.set(id, title);
          }
        } catch {
          // skip failed lookups
        }
      }

      if (!cancelled) {
        setLoaded(results);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  return { titles: loaded, isLoading };
}
