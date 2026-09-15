import { beforeEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import SettingsNav from './SettingsNav';

beforeEach(async () => {
  await i18n.changeLanguage('es');
  useSettingsUiStore.setState({ activeSection: 'browser_extension', hiddenSections: new Set() });
});

it('reveals deep-linked settings and supports search plus Enter selection', async () => {
  render(<SettingsNav collapsed={false} />);
  expect(screen.getByRole('button', { name: i18n.t('settings.tabs.browser_extension') })).toHaveAttribute('aria-current', 'page');
  const input = screen.getByRole('textbox', { name: i18n.t('settings.search') });
  await userEvent.type(input, i18n.t('settings.tabs.language'));
  expect(screen.queryByRole('button', { name: i18n.t('settings.tabs.browser_extension') })).not.toBeInTheDocument();
  await userEvent.keyboard('{Enter}');
  expect(useSettingsUiStore.getState().activeSection).toBe('language');
  expect(input).toHaveValue('');
  expect(screen.getByRole('button', { name: i18n.t('settings.tabs.language') })).toHaveAttribute('aria-current', 'page');
});

it('keeps unavailable sections out of navigation and search', async () => {
  useSettingsUiStore.setState({ hiddenSections: new Set(['browser_extension']) });
  render(<SettingsNav collapsed={false} />);
  await userEvent.type(screen.getByRole('textbox'), i18n.t('settings.tabs.browser_extension'));
  expect(screen.getByText(i18n.t('settings.search_empty'))).toBeVisible();
});
