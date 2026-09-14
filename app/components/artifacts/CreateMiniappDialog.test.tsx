import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import CreateMiniappDialog from './CreateMiniappDialog';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('miniapp idea composer', () => {
  it('lets the user adapt an inspiration before handing it to Many', async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<CreateMiniappDialog onClose={vi.fn()} onContinue={onContinue} />);
    const submit = screen.getByRole('button', { name: i18n.t('artifacts.miniapp_continue') });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('artifacts.idea_calculator')) }));
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(i18n.t('artifacts.idea_calculator_prompt'));
    expect(onContinue).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '  Un jardín interactivo con mis hábitos  ');
    await user.click(submit);
    expect(onContinue).toHaveBeenCalledWith('Un jardín interactivo con mis hábitos');
  });

  it('dismisses without starting a creation', async () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    render(<CreateMiniappDialog onClose={onClose} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: i18n.t('common.cancel') }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
