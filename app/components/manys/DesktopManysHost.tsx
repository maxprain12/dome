import { useMemo, type ReactNode } from 'react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/types';
import DesktopLibraryScope from './DesktopLibraryScope';
import { ManysHostProvider, type ManysHostValue } from './ManysHost';

/** Syncs the library, loads the resource a Many produced and opens it in a tab. Rejects with an error code. */
async function openResource(id: string): Promise<void> {
  const sync = await window.electron.domainSync.syncNow({ domain: 'library' });
  if (!sync.success) throw new Error('service_unavailable');
  const loadedResource = await window.electron.db.resources.getById(id) as { success: boolean; data?: Resource };
  if (!loadedResource.success || !loadedResource.data) throw new Error('resource_not_found');
  const resource = loadedResource.data;
  useAppStore.getState().addResource(resource);
  useTabStore.getState().openResourceTab(resource.id, resource.type, resource.title);
}

/** The desktop shell around the cloud Manys view: the local library, its tabs and its stores. */
export default function DesktopManysHost({ children }: { children: ReactNode }) {
  const value = useMemo<ManysHostValue>(() => ({ openResource, libraryScope: DesktopLibraryScope }), []);
  return <ManysHostProvider value={value}>{children}</ManysHostProvider>;
}
