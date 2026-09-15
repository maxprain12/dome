import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import { useManyStore } from '@/lib/store/useManyStore';
import ManyHistoryView from './ManyHistoryView';

beforeEach(async () => {
  await i18n.changeLanguage('es');
  useManyStore.setState({ sessions: [{ id: 'saved', title: 'Proyecto Atlas', messages: [], createdAt: Date.now() }], currentSessionId: 'saved', messages: [], activeRunBySessionId: {}, toggleSessionPin: vi.fn(), deleteSession: vi.fn() });
});

it('opens a saved chat separately from its pin/delete menu', async () => {
  const onSelectSession = vi.fn();
  render(<ManyHistoryView onSelectSession={onSelectSession} onNewChat={vi.fn()} />);
  const row = screen.getByRole('button', { name: /Proyecto Atlas/ });
  expect(row).toHaveAttribute('aria-current', 'page');
  await userEvent.click(row);
  expect(onSelectSession).toHaveBeenCalledWith('saved');
  await userEvent.click(screen.getByRole('button', { name: i18n.t('many.conversation_actions') }));
  const pinAction = await screen.findByRole('menuitem', { name: i18n.t('chat.pin_conversation') });
  await userEvent.click(pinAction);
  expect(useManyStore.getState().toggleSessionPin).toHaveBeenCalledWith('saved');
  expect(useManyStore.getState().deleteSession).not.toHaveBeenCalled();
});
