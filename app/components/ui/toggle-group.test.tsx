import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

describe('ToggleGroup', () => {
  it('models a single view choice without hand-rolled active buttons', async () => {
    render(<ToggleGroup defaultValue={['list']}><ToggleGroupItem value="list">Lista</ToggleGroupItem><ToggleGroupItem value="grid">Cuadrícula</ToggleGroupItem></ToggleGroup>);
    await userEvent.click(screen.getByRole('button', { name: 'Cuadrícula' }));
    expect(screen.getByRole('button', { name: 'Cuadrícula' })).toHaveAttribute('aria-pressed', 'true');
  });
});
