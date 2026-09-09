import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { DetailModal } from './DetailModal';
import { ConfirmDialog } from './ConfirmDialog';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Abrir ficha</button>
    <DetailModal open={open} onClose={() => setOpen(false)} title="Documento" footer={<button onClick={() => setConfirm(true)}>Eliminar</button>}>
      <label>Nota<input /></label>
      <ConfirmDialog isOpen={confirm} title="Eliminar documento" message="Documento" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} confirmLabel="Eliminar" cancelLabel="Cancelar" />
    </DetailModal>
  </>;
}

describe('DetailModal', () => {
  beforeEach(async () => { await i18n.changeLanguage('es'); });
  it('isolates the background, traps keyboard focus and restores the opening control', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Abrir ficha' });
    await user.click(trigger);
    const modal = screen.getByRole('dialog', { name: 'Documento' });
    expect(screen.queryByRole('button', { name: 'Abrir ficha' })).not.toBeInTheDocument();
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
    }
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps a nested confirmation above the detail and returns to it on cancel', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    await user.type(screen.getByLabelText('Nota'), 'Borrador de revisión');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Eliminar documento' });
    await user.click(within(confirmation).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Documento' })).toBeVisible();
    expect(screen.getByLabelText('Nota')).toHaveValue('Borrador de revisión');
  });

  it('uses the supplied close handler for the header button', async () => {
    const close = vi.fn();
    render(<DetailModal title="Ficha" onClose={close}>Contenido</DetailModal>);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
