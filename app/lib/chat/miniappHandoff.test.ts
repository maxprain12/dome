import { beforeEach, expect, it, vi } from 'vitest';
import { openMiniappDraft } from './miniappHandoff';

const many = vi.hoisted(() => ({ addPinnedResource: vi.fn(), setPendingManyHandoff: vi.fn(), setOpen: vi.fn() }));
vi.mock('@/lib/store/useManyStore', () => ({ useManyStore: { getState: () => many } }));
beforeEach(() => vi.clearAllMocks());

it('opens a creation draft without adding an empty artifact', () => {
  openMiniappDraft('Create a calculator');
  expect(many.setPendingManyHandoff).toHaveBeenCalledWith('Create a calculator');
  expect(many.setOpen).toHaveBeenCalledWith(true);
  expect(many.addPinnedResource).not.toHaveBeenCalled();
});

it('pins the existing app so customization targets its saved identity', () => {
  openMiniappDraft('Add a filter', { id: 'saved-app', title: 'My tracker' });
  expect(many.addPinnedResource).toHaveBeenCalledWith({ id: 'saved-app', title: 'My tracker', type: 'artifact', kind: 'resource' });
  expect(many.setPendingManyHandoff).toHaveBeenCalledWith('Add a filter');
});
