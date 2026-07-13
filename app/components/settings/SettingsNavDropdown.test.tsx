import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsNavDropdown from './SettingsNavDropdown';

describe('Settings narrow navigation', () => {
  it('opens as a titled Sheet and closes after selecting a section', async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();
    render(<SettingsNavDropdown activeSection="general" onSectionChange={onSectionChange} />);

    await user.click(screen.getByRole('button', { name: /general/i }));
    expect(
      await screen.findByRole('dialog', { name: /settings|ajustes/i }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /language|idioma/i }));

    expect(onSectionChange).toHaveBeenCalledWith('language');
  });
});
