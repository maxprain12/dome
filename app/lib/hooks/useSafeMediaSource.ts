import { useEffect, useState, useRef } from 'react';

export interface UseSafeMediaSourceResult {
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

function canLoadMedia(resourceId: string | undefined): resourceId is string {
  return Boolean(
    resourceId && typeof window !== 'undefined' && window.electron?.resource?.readFileBuffer,
  );
}

/**
 * Carga el archivo del recurso en un Blob URL para evitar `file://` en el renderer
 * cuando el origen es http: o app:.
 */
export function useSafeMediaSource(resourceId: string | undefined): UseSafeMediaSourceResult {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(resourceId));
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const prevResourceIdRef = useRef(resourceId);
  if (resourceId !== prevResourceIdRef.current) {
    prevResourceIdRef.current = resourceId;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (!canLoadMedia(resourceId)) {
      setObjectUrl(null);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
      setObjectUrl(null);
    }
  }

  useEffect(() => {
    if (!canLoadMedia(resourceId)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await window.electron.resource.readFileBuffer(resourceId);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setError(!res.success ? (res.error ?? 'Failed to load media') : 'Failed to load media');
          setLoading(false);
          return;
        }
        const mime =
          'mimeType' in res && typeof (res as { mimeType?: string }).mimeType === 'string'
            ? (res as { mimeType: string }).mimeType
            : 'application/octet-stream';
        const blob = new Blob([res.data], { type: mime });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [resourceId]);

  return { objectUrl, loading, error };
}
