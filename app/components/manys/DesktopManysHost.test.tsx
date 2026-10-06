import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopManysHost from './DesktopManysHost';
import { useManysHost } from './ManysHost';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';

type Host = ReturnType<typeof useManysHost>;
let host: Host = {};
function Probe() {
  host = useManysHost();
  return <span data-testid="probe" />;
}

const resource = { id: 'res-1', type: 'note', title: 'Report' };

beforeEach(() => {
  host = {};
  (window as unknown as { electron: unknown }).electron = {
    domainSync: { syncNow: vi.fn(async () => ({ success: true })) },
    db: { resources: { getById: vi.fn(async (id: string) => (id === 'res-1' ? { success: true, data: resource } : { success: false })) } },
  };
});
afterEach(() => { delete (window as unknown as { electron?: unknown }).electron; });

describe('DesktopManysHost', () => {
  it('offers the cloud Manys both desktop slots', () => {
    render(<DesktopManysHost><Probe /></DesktopManysHost>);
    expect(screen.getByTestId('probe')).toBeInTheDocument();
    expect(host.openResource).toBeTypeOf('function');
    expect(host.libraryScope).toBeTypeOf('function');
  });

  it('syncs the library, adds the resource to the store and opens its tab', async () => {
    const addResource = vi.spyOn(useAppStore.getState(), 'addResource').mockImplementation(() => undefined);
    const openResourceTab = vi.spyOn(useTabStore.getState(), 'openResourceTab').mockImplementation(() => undefined as never);
    render(<DesktopManysHost><Probe /></DesktopManysHost>);
    await host.openResource?.('res-1');
    expect(window.electron.domainSync.syncNow).toHaveBeenCalledWith({ domain: 'library' });
    expect(addResource).toHaveBeenCalledWith(resource);
    expect(openResourceTab).toHaveBeenCalledWith('res-1', 'note', 'Report');
    addResource.mockRestore();
    openResourceTab.mockRestore();
  });

  it('rejects with a code when the resource is gone or the sync fails', async () => {
    render(<DesktopManysHost><Probe /></DesktopManysHost>);
    await expect(host.openResource?.('missing')).rejects.toThrow('resource_not_found');
    (window.electron.domainSync.syncNow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });
    await expect(host.openResource?.('res-1')).rejects.toThrow('service_unavailable');
  });
});
