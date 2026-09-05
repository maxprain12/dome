import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import PeoplePicker from './PeoplePicker';

const getMany = vi.fn();
const search = vi.fn();

describe('PeoplePicker', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    getMany.mockReset();
    search.mockReset();
    getMany.mockResolvedValue({
      success: true,
      data: {
        people: [
          { id: 'p1', displayName: 'Ada' },
          { id: 'p2', displayName: 'Grace' },
        ],
      },
    });
    search.mockResolvedValue({ success: true, data: { people: [] } });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        people: { getMany, search, get: vi.fn() },
      },
    });
  });

  it('resolves linked names with a single getMany call', async () => {
    render(
      <PeoplePicker projectId="proj" personIds={['p1', 'p2']} onChange={() => undefined} />,
    );
    await waitFor(() => {
      expect(getMany).toHaveBeenCalledTimes(1);
    });
    expect(getMany).toHaveBeenCalledWith({ ids: ['p1', 'p2'] });
    expect(window.electron.people.get).not.toHaveBeenCalled();
  });
});
