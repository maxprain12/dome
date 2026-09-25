import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaPermissionKind, MediaPermissionsSnapshot } from './types';

const UNKNOWN: MediaPermissionsSnapshot = { managedByApp: true, microphone: 'unknown', screen: 'unknown' };

export interface UseMediaPermissions {
  snapshot: MediaPermissionsSnapshot;
  loading: boolean;
  /** Kinds granted during this session (Screen Recording needs a relaunch to apply). */
  grantedThisSession: ReadonlySet<MediaPermissionKind>;
  refresh: () => Promise<MediaPermissionsSnapshot>;
  request: (kind: MediaPermissionKind) => Promise<void>;
  openSettings: (kind: MediaPermissionKind) => Promise<void>;
  relaunch: () => Promise<void>;
}

/** Live view of OS media permissions; re-reads when the window regains focus (user back from System Settings). */
export function useMediaPermissions(): UseMediaPermissions {
  const [snapshot, setSnapshot] = useState<MediaPermissionsSnapshot>(UNKNOWN);
  const [loading, setLoading] = useState(false);
  const [grantedThisSession, setGrantedThisSession] = useState<ReadonlySet<MediaPermissionKind>>(new Set());
  const previous = useRef<MediaPermissionsSnapshot | null>(null);

  const refresh = useCallback(async () => {
    const api = globalThis.window?.electron?.permissions;
    if (!api) return UNKNOWN;
    const res = await api.get();
    const next = res.success && res.data ? res.data : UNKNOWN;
    const prev = previous.current;
    if (prev) {
      const newlyGranted = (['microphone', 'screen'] as const).filter(
        (kind) => prev[kind] !== 'granted' && prev[kind] !== 'unknown' && next[kind] === 'granted',
      );
      if (newlyGranted.length > 0) {
        setGrantedThisSession((current) => new Set([...current, ...newlyGranted]));
      }
    }
    previous.current = next;
    setSnapshot(next);
    return next;
  }, []);

  const request = useCallback(async (kind: MediaPermissionKind) => {
    const api = globalThis.window?.electron?.permissions;
    if (!api) return;
    setLoading(true);
    try {
      await api.request(kind);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const openSettings = useCallback(async (kind: MediaPermissionKind) => {
    await globalThis.window?.electron?.permissions?.openSettings(kind);
  }, []);

  const relaunch = useCallback(async () => {
    await globalThis.window?.electron?.permissions?.relaunch();
  }, []);

  useEffect(() => {
    const onFocus = () => {
      refresh().catch(() => undefined);
    };
    onFocus();
    globalThis.window?.addEventListener('focus', onFocus);
    return () => globalThis.window?.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { snapshot, loading, grantedThisSession, refresh, request, openSettings, relaunch };
}
