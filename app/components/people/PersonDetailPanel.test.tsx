import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import PersonDetailPanel from './PersonDetailPanel';
import type { PersonDetail } from './peopleTypes';

function person(partial: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'person-uuid-ig',
    displayName: '@ad.vo2',
    primaryEmail: null,
    avatarUrl: null,
    notes: null,
    leadStatus: 'lead',
    profile: {},
    discoveredVia: 'instagram_comment',
    identities: [
      {
        source: 'social_instagram',
        externalId: '178414000',
        displayLabel: '@ad.vo2',
        meta: {
          username: 'ad.vo2',
          name: 'Ad Vo',
          biography: 'Founder at Harmony',
          followers_count: 1200,
          media_count: 34,
          profile_url: 'https://www.instagram.com/ad.vo2/',
        },
      },
    ],
    interactions: [{ id: 'ix-1', kind: 'note', summary: 'Primer contacto', occurredAt: Date.UTC(2024, 0, 1) }],
    ...partial,
  };
}

const defaults = {
  saving: false,
  addingNote: false,
  onSave: vi.fn().mockResolvedValue(true),
  onAddNote: vi.fn().mockResolvedValue(true),
  onDelete: vi.fn(),
  onEnrich: vi.fn(),
  onOpenPipelines: vi.fn(),
  onOpenCalendar: vi.fn(),
};

describe('PersonDetailPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    vi.clearAllMocks();
  });

  it('stacks the contact as an editable form with full Instagram actions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(<PersonDetailPanel {...defaults} onSave={onSave} person={person()} />);

    expect(screen.getByText('Instagram')).toBeVisible();
    expect(screen.getByText('Datos')).toBeVisible();
    expect(screen.getByText('Comunicación')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeVisible();
    const openProfile = screen.getByRole('button', { name: 'Abrir perfil de Instagram' });
    expect(openProfile).toBeVisible();
    expect(openProfile).toHaveAttribute('href', 'https://www.instagram.com/ad.vo2/');

    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveValue('@ad.vo2');
    expect(screen.getByLabelText('Correo')).toHaveValue('');
    expect(screen.getByLabelText('Empresa')).toHaveValue('');
    expect(screen.getByPlaceholderText('Notas internas sobre este contacto…')).toHaveValue('');

    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByText('person-uuid-ig')).not.toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Ad Vo');
    expect(save).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeVisible();

    await user.click(save);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Ad Vo',
        leadStatus: 'lead',
      }),
    );

    expect(screen.getByRole('button', { name: 'Llamar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Correo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hablar en Many' })).toBeEnabled();
  });

  it('lists linked identities with human labels and an open action', async () => {
    const user = userEvent.setup();
    render(<PersonDetailPanel {...defaults} person={person()} />);

    await user.click(screen.getByRole('tab', { name: 'Identidades' }));
    const openIdentity = screen.getByRole('button', { name: 'Abrir' });
    expect(openIdentity).toHaveAttribute('href', 'https://www.instagram.com/ad.vo2/');
    expect(screen.getAllByText('@ad.vo2').length).toBeGreaterThan(0);
    expect(screen.queryByText('178414000')).not.toBeInTheDocument();
  });

  it('keeps in-progress edits when the hub re-renders the same contact', async () => {
    const user = userEvent.setup();
    const first = person();
    const { rerender } = render(<PersonDetailPanel {...defaults} person={first} />);
    const name = screen.getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Ad Vo');
    rerender(<PersonDetailPanel {...defaults} person={{ ...first, identities: [...(first.identities ?? [])] }} />);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ad Vo');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });
});
