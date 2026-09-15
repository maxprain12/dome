import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { normalizeDashboardPanels, useDashboardPanels } from '@/lib/store/useDashboardPanels';
import { DashboardWorkspace } from './DashboardWorkspace';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useDashboardPanels.setState({ layouts: {} });
});

const panels = [
  { id: 'agenda', label: 'Agenda', content: <p>Upcoming work</p> },
  { id: 'recent', label: 'Recent', content: <p>Recent documents</p> },
];
const view = () => <DashboardWorkspace scope="home" title="Home" eyebrow="Workspace" description="Your day" panels={panels} />;

it('recovers stale, duplicate and malformed preferences while preserving valid choices', () => {
  expect(normalizeDashboardPanels([{ id: 'recent', visible: false, wide: true }, { id: 'recent' }, null, { id: 'removed' }, { id: 'agenda', visible: 'yes' }], panels.map((p) => ({ id: p.id, visible: true, wide: false })))).toEqual([
    { id: 'recent', visible: false, wide: true }, { id: 'agenda', visible: true, wide: false },
  ]);
});

it('saves visibility, width and order across remounts, independently from Social, and resets', async () => {
  useDashboardPanels.getState().setLayout('social', [{ id: 'summary', visible: false, wide: true }]);
  const user = userEvent.setup();
  const { unmount } = render(view());
  await user.click(screen.getByRole('button', { name: 'Customize dashboard' }));
  const sheet = screen.getByRole('dialog');
  await user.click(within(sheet).getByRole('switch', { name: 'Agenda' }));
  await user.click(within(sheet).getByRole('button', { name: 'Move Recent up' }));
  await user.click(within(sheet).getAllByRole('button', { name: 'Full' })[0]);
  expect(useDashboardPanels.getState().layouts.home?.[0]).toEqual({ id: 'recent', visible: true, wide: true });
  expect(JSON.parse(localStorage.getItem('dome:dashboard-panels:v2')!).state.layouts.home[1].visible).toBe(false);
  expect(useDashboardPanels.getState().layouts.social?.[0].visible).toBe(false);
  await user.keyboard('{Escape}');
  unmount();
  render(view());
  expect(screen.queryByRole('region', { name: 'Agenda' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customize dashboard' }));
  await user.click(screen.getByRole('button', { name: 'Reset layout' }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('region', { name: 'Agenda' })).toBeInTheDocument();
});
