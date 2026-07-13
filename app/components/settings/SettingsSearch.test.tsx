import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsSearch from './SettingsSearch';

describe('SettingsSearch', () => {
  it('finds a registered section and navigates to its canonical id', async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();
    render(<SettingsSearch onSectionChange={onSectionChange} />);

    await user.click(screen.getByRole('button', { name: /search settings|buscar ajustes/i }));
    await user.type(
      screen.getByPlaceholderText(/search by name|buscar por nombre/i),
      'appearance',
    );
    const options = await screen.findAllByRole('option');
    const appearanceOption = options.find((option) =>
      option.getAttribute('data-value')?.toLowerCase().startsWith('appearance '),
    );
    expect(appearanceOption).toBeDefined();
    await user.click(appearanceOption!);

    expect(onSectionChange).toHaveBeenCalledWith('appearance');
  });
});
