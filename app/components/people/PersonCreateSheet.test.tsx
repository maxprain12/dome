import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { PersonCreateSheet } from './PersonCreateSheet';

describe('PersonCreateSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('creates a contact from the side form without showing ids', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: 'person-new', displayName: 'Nasim Ahmed' });
    const onOpenChange = vi.fn();
    render(
      <PersonCreateSheet open onOpenChange={onOpenChange} onCreate={onCreate} />,
    );

    expect(screen.getByText('Nuevo contacto')).toBeVisible();
    expect(screen.getByText('Datos')).toBeVisible();
    await user.type(screen.getByLabelText('Nombre'), 'Nasim Ahmed');
    await user.type(screen.getByLabelText('Correo'), 'nasim@example.com');
    await user.type(screen.getByLabelText('Empresa'), 'Landify');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(onCreate).toHaveBeenCalledWith({
      displayName: 'Nasim Ahmed',
      primaryEmail: 'nasim@example.com',
      leadStatus: 'lead',
      company: 'Landify',
      notes: undefined,
    });
    expect(screen.queryByText('person-new')).not.toBeInTheDocument();
  });
});
