import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { MailDetailPanel } from './MailDetailPanel';

const selected = { id: 'mail-1', subject: 'Revisión de propuesta', from: { name: 'Lucía', addr: 'lucia@example.com' }, date: '2026-09-09T09:00:00Z' };

describe('mail detail modal', () => {
  beforeEach(async () => { await i18n.changeLanguage('es'); });

  it('keeps HTML sandboxed and exposes reply without sending a message', async () => {
    const reply = vi.fn();
    render(<MailDetailPanel selected={selected} folder="INBOX" reading={false} error={null} message={{ html: '<p>Revisamos la propuesta el jueves.</p>' }} onClose={vi.fn()} onReply={reply} onAskMany={vi.fn()} />);
    const modal = screen.getByRole('dialog', { name: selected.subject });
    const body = within(modal).getByTitle('email-body');
    expect(body).toHaveAttribute('sandbox', '');
    expect(body).toHaveAttribute('srcdoc', expect.stringContaining('Revisamos la propuesta'));
    await userEvent.click(within(modal).getByRole('button', { name: 'Responder' }));
    expect(reply).toHaveBeenCalledOnce();
  });

  it('dismisses the modal when handing the message to Many', async () => {
    const close = vi.fn();
    const many = vi.fn();
    render(<MailDetailPanel selected={selected} folder="INBOX" reading={false} error={null} message="Mensaje" onClose={close} onReply={vi.fn()} onAskMany={many} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preguntar a Many' }));
    expect(many).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
