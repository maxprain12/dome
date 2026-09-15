import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { DashboardAgenda } from './DashboardAgenda';

it('shows the selected day and opens the calendar without completing events', async () => {
  await i18n.changeLanguage('en');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const onCalendar = vi.fn();
  render(<DashboardAgenda events={[{ id: 'tomorrow', title: 'Editorial review', start_at: tomorrow.getTime() }]} pending={[]} loading={false} onCalendar={onCalendar} onPending={() => {}} />);
  expect(screen.queryByText('Editorial review')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: tomorrow.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }) }));
  await userEvent.click(screen.getByRole('button', { name: /Editorial review/ }));
  expect(onCalendar).toHaveBeenCalledOnce();
});
