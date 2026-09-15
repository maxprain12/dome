import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import PeopleList from './PeopleList';
import type { PersonSummary } from './peopleTypes';

function person(partial: Partial<PersonSummary> & { id: string; displayName: string }): PersonSummary {
  return {
    primaryEmail: null,
    avatarUrl: null,
    notes: null,
    leadStatus: 'lead',
    profile: {},
    discoveredVia: 'manual',
    firstSeenAt: Date.UTC(2023, 8, 3),
    lastSeenAt: Date.UTC(2023, 9, 24),
    identities: [],
    ...partial,
  };
}

const defaults = {
  loading: false,
  query: '',
  onQueryChange: vi.fn(),
  filter: 'all',
  onFilterChange: vi.fn(),
  selectedId: null as string | null,
  onSelect: vi.fn(),
  checkedIds: new Set<string>(),
  onToggleChecked: vi.fn(),
  onToggleAllChecked: vi.fn(),
  onDeletePeople: vi.fn(),
  onManageStatuses: vi.fn(),
  onCreate: vi.fn(),
};

describe('PeopleList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    vi.clearAllMocks();
  });

  it('renders a structured table with human labels, not ids', () => {
    render(
      <PeopleList
        {...defaults}
        people={[
          person({
            id: 'person-uuid-1',
            displayName: 'Shuja ibn Wahb',
            primaryEmail: 'shuja@example.com',
            profile: { company: 'Harmony' },
            leadStatus: 'prospect',
            discoveredVia: 'social_instagram',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeVisible();
    expect(screen.getByText('Shuja ibn Wahb')).toBeVisible();
    expect(screen.getByText('Harmony')).toBeVisible();
    expect(screen.getByText('Instagram')).toBeVisible();
    expect(screen.getByText('Prospecto')).toBeVisible();
    expect(screen.getByText(/Mostrando 1–1 de 1/)).toBeVisible();
    expect(screen.queryByText('person-uuid-1')).not.toBeInTheDocument();
  });

  it('opens a contact from the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PeopleList
        {...defaults}
        onSelect={onSelect}
        people={[person({ id: 'person-9', displayName: 'Ammar ibn Yasir' })]}
      />,
    );

    await user.click(screen.getByText('Ammar ibn Yasir'));
    expect(onSelect).toHaveBeenCalledWith('person-9');
  });

  it('shows an empty dashboard with a create action', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<PeopleList {...defaults} onCreate={onCreate} people={[]} />);

    expect(screen.getByText('Todavía no hay contactos')).toBeVisible();
    const createButtons = screen.getAllByRole('button', { name: 'Nuevo contacto' });
    expect(createButtons.length).toBeGreaterThan(0);
    await user.click(createButtons[0]!);
    expect(onCreate).toHaveBeenCalled();
  });
});
