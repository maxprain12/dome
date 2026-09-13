import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useDetailModalClose } from '@/components/shared/DetailModal';
import { PersonDetailSheet } from './PersonDetailSheet';

function CloseProbe() {
  const close = useDetailModalClose();
  return (
    <Button type="button" onClick={() => close?.()}>
      Cerrar ficha
    </Button>
  );
}

describe('PersonDetailSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('opens the contact as a side panel, not a centered modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PersonDetailSheet open onClose={onClose} title="Shuja ibn Wahb">
        <p>Perfil de Shuja ibn Wahb</p>
        <CloseProbe />
      </PersonDetailSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Shuja ibn Wahb' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute('data-side', 'right');
    expect(dialog.className).toMatch(/overflow-hidden/);
    expect(dialog.className).toMatch(/overscroll-contain/);
    expect(dialog.className).toMatch(/contain-paint/);
    expect(screen.getByText('Perfil de Shuja ibn Wahb')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cerrar ficha' }));
    expect(onClose).toHaveBeenCalled();
  });
});
