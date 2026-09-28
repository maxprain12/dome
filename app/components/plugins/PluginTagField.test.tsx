import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import PluginTagField from './PluginTagField';

describe('PluginTagField', () => {
  it('adds a tag with enter and removes it from the chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PluginTagField id="tags" label="Tags" value={['astro']} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'tutorial{Enter}');
    expect(onChange).toHaveBeenCalledWith(['astro', 'tutorial']);

    await user.click(screen.getByRole('button', { name: i18n.t('plugins.tags_remove', { tag: 'astro' }) }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('splits a comma-separated paste into tags', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PluginTagField id="tags" label="Tags" value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('textbox', { name: 'Tags' }));
    await user.paste('astro, tutorial');
    expect(onChange).toHaveBeenCalledWith(['astro', 'tutorial']);
  });
});
