import { useEffect, useState } from 'react';

const SOCIAL_MEDIA_CACHE = 'dome-social-media-v1';

type CachedMediaSource = {
  source: string | null;
  loading: boolean;
};

/**
 * Keeps remote social media in Chromium's persistent Cache Storage.
 * If a provider CDN does not allow CORS, the original URL remains the fallback.
 */
export function useCachedMediaSource(url?: string | null): CachedMediaSource {
  const [source, setSource] = useState<string | null>(url || null);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSource(url || null);
    setLoading(Boolean(url));

    if (!url || typeof caches === 'undefined') {
      setLoading(false);
      return undefined;
    }

    void (async () => {
      try {
        const cache = await caches.open(SOCIAL_MEDIA_CACHE);
        let response = await cache.match(url);

        if (!response || !response.ok) {
          response = await fetch(url, { credentials: 'omit', mode: 'cors' });
          if (response.ok) await cache.put(url, response.clone());
        }

        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch {
        // Keep the original URL so a provider without CORS still renders.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { source, loading };
}
