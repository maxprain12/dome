import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BotIcon } from '@hugeicons/core-free-icons';
import { ShellSidebar, ShellNavItem, ShellNavSection } from './ShellSidebar';

it('supports keyboard disclosure and reveals a destination selected elsewhere', async () => {
  const onClick = vi.fn();
  const view = (activeId?: string) => <ShellSidebar collapsed={false} label="Navigation"><ShellNavSection label="Many" icon={BotIcon} activeId={activeId}><ShellNavItem nested icon={BotIcon} label="Agents" active={activeId === 'agents'} onClick={onClick} /></ShellNavSection></ShellSidebar>;
  const { rerender } = render(view());
  const trigger = screen.getByRole('button', { name: 'Many' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Agents' }));
  expect(onClick).toHaveBeenCalledOnce();
  await userEvent.click(trigger);
  rerender(view('agents'));
  expect(screen.getByRole('button', { name: 'Many' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Agents' })).toHaveAttribute('aria-current', 'page');
});

it('removes a collapsed sidebar from keyboard navigation', async () => {
  render(<><ShellSidebar collapsed label="Navigation"><button type="button">Hidden action</button></ShellSidebar><button type="button">Content action</button></>);
  expect(screen.queryByRole('button', { name: 'Hidden action' })).not.toBeInTheDocument();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: 'Content action' })).toHaveFocus();
});

it('leaves editor formatting shortcuts to the existing shell handlers', () => {
  render(<ShellSidebar collapsed={false} label="Navigation"><span>Content</span></ShellSidebar>);
  const shortcut = new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true });
  window.dispatchEvent(shortcut);
  expect(shortcut.defaultPrevented).toBe(false);
});
