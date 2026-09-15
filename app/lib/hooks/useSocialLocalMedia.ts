import { useEffect, useState } from 'react';
import type { SocialMediaItem } from '@/components/social/socialTypes';

function httpUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function socialStoragePath(value?: string | null): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/^\/+/, '');
  return clean.startsWith('social-media/') && !clean.includes('..') ? clean : undefined;
}

export function socialPreviewRequest(item: SocialMediaItem, storagePath?: string | null) {
  const cloud = socialStoragePath(item.url) || socialStoragePath(storagePath);
  const path = typeof item.path === 'string' && item.path ? item.path : undefined;
  const resourceId = typeof item.resourceId === 'string' && item.resourceId ? item.resourceId : undefined;
  if (!path && !resourceId && !cloud) return null;
  return { path, resourceId, storagePath: cloud };
}

/**
 * Remote https URL, or a local/cloud still from `social:media:preview`.
 */
export function useSocialLocalMedia(item: SocialMediaItem, storagePath?: string | null) {
  const remoteUrl = httpUrl(item.url) || httpUrl(item.thumbnailUrl) || null;
  const request = remoteUrl ? null : socialPreviewRequest(item, storagePath);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(request));

  useEffect(() => {
    if (!request || typeof window === 'undefined' || !window.electron?.invoke) {
      setLocalUrl(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void window.electron.invoke('social:media:preview', request).then((result) => {
      if (cancelled) return;
      const dataUrl = result?.success && result.data && typeof result.data.dataUrl === 'string'
        ? result.data.dataUrl
        : null;
      setLocalUrl(dataUrl);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLocalUrl(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [request?.path, request?.resourceId, request?.storagePath]);

  return { remoteUrl, localUrl, loading };
}
