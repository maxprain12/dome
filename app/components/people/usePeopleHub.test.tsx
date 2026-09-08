import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePeopleHub } from './usePeopleHub';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/lib/store/useToastStore', () => ({ showToast: toast }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const person = (id: string) => ({ success: true, data: { person: { id, displayName: id, identities: [] } } });
const options = { projectId: 'vault', errorLabel: 'Load failed', saveErrorLabel: 'Save failed', noteErrorLabel: 'Note failed' };
beforeEach(() => {
  Object.assign(window.electron, { people: {
    list: vi.fn().mockResolvedValue({ success: true, data: { people: [] } }),
    get: vi.fn().mockImplementation(async ({ id }) => person(id)),
    updateProfile: vi.fn(), addInteraction: vi.fn(), delete: vi.fn(), enrich: vi.fn(),
  } });
});
describe('contact request ownership', () => {
  it('keeps the newest selection when an older detail request finishes last', async () => {
    const slow = deferred<ReturnType<typeof person>>();
    vi.mocked(window.electron.people.get).mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => usePeopleHub(options));
    act(() => { void result.current.selectPerson('A'); });
    await act(() => result.current.selectPerson('B'));
    await act(async () => { slow.resolve(person('A')); });
    expect(result.current.selectedId).toBe('B');
    expect(result.current.selectedPerson?.id).toBe('B');
    expect(result.current.detailLoading).toBe(false);
  });
  it('does not let a profile save or note completion restore a previous selection', async () => {
    const save = deferred<ReturnType<typeof person>>();
    const note = deferred<{ success: boolean }>();
    vi.mocked(window.electron.people.updateProfile).mockReturnValueOnce(save.promise);
    vi.mocked(window.electron.people.addInteraction).mockReturnValueOnce(note.promise);
    const { result } = renderHook(() => usePeopleHub(options));
    await act(() => result.current.selectPerson('A'));
    act(() => { void result.current.saveProfile({ displayName: 'Edited' }); void result.current.addNote('Note'); });
    await act(() => result.current.selectPerson('B'));
    await act(async () => { save.resolve(person('A')); note.resolve({ success: true }); });
    expect(result.current.selectedPerson?.id).toBe('B');
    expect(window.electron.people.get).toHaveBeenCalledTimes(2);
  });
  it('keeps a newer list when an older filter response arrives late', async () => {
    const slow = deferred<{ success: boolean; data: { people: { id: string; displayName: string }[] } }>();
    vi.mocked(window.electron.people.list).mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ success: true, data: { people: [{ id: 'client', displayName: 'Client' }] } });
    const { result } = renderHook(() => usePeopleHub(options));
    act(() => result.current.setFilter('client'));
    await waitFor(() => expect(result.current.people[0]?.id).toBe('client'));
    await act(async () => { slow.resolve({ success: true, data: { people: [{ id: 'old', displayName: 'Old' }] } }); });
    expect(result.current.people[0]?.id).toBe('client');
  });
  it('reports IPC rejection and releases loading state', async () => {
    vi.mocked(window.electron.people.list).mockRejectedValueOnce(new Error('Database unavailable'));
    const { result } = renderHook(() => usePeopleHub(options));
    await waitFor(() => expect(result.current.listLoading).toBe(false));
    expect(toast).toHaveBeenCalledWith('error', 'Database unavailable');
    expect(result.current.people).toEqual([]);
  });
});
