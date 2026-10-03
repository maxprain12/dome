import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TabPaneShell from './TabPaneShell';

test.each([false, true])('persistent content activates without RAF or reveal filters (reduced motion %s)', reduced => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.mocked(window.matchMedia).mockReturnValue({ matches: reduced } as MediaQueryList);
  const { rerender } = render(<TabPaneShell tabId="A" isActive isPersistent><input aria-label="Draft" defaultValue="Keep this draft" /></TabPaneShell>);
  const pane = screen.getByRole('textbox').parentElement!;
  expect(pane).toHaveAttribute('aria-hidden', 'false'); expect(pane.style.opacity).toBe(''); expect(pane.style.filter).toBe('');
  rerender(<TabPaneShell tabId="A" isActive={false} isPersistent><input aria-label="Draft" defaultValue="Keep this draft" /></TabPaneShell>);
  expect(pane).toHaveAttribute('aria-hidden', 'true'); expect(pane).toHaveClass('hidden');
  rerender(<TabPaneShell tabId="A" isActive isPersistent><input aria-label="Draft" defaultValue="Keep this draft" /></TabPaneShell>);
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft'); expect(pane).not.toHaveClass('hidden'); expect(window.requestAnimationFrame).not.toHaveBeenCalled();
});
