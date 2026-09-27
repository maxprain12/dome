import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '@/lib/i18n';
import SectionOnboardingCard from './SectionOnboardingCard';
import { useSectionTourStore } from '@/lib/store/useSectionTourStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { SECTION_KEYS, getSectionGuide, sectionForTab } from '@/lib/onboarding/sectionGuides';
import { SIDEBAR_NAV_TAB_TYPES } from '@/lib/tabs/tabRegistry';
import { setDismissedTours } from '@/lib/settings';
vi.mock('@/lib/settings', async (original) => ({ ...await original<typeof import('@/lib/settings')>(), setDismissedTours: vi.fn().mockResolvedValue(undefined) }));
beforeEach(async () => {
  await i18n.changeLanguage('en');
  useSectionTourStore.setState({ loaded: true, seen: {} });
  useUserStore.setState({ isOnboardingCompleted: true });
});
it('shows on first visit, persists dismissal and can be reopened', async () => {
  render(<SectionOnboardingCard sectionKey="home" />);
  expect(screen.getByRole('heading', { name: 'Your workspace' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: i18n.t('sectionGuide.setup.skip') }));
  await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument());
  expect(setDismissedTours).toHaveBeenCalledWith({ home: true });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('sectionGuide.setup.reopen') }));
  expect(screen.getByRole('heading', { name: 'Your workspace' })).toBeVisible();
});
it('does not interrupt account setup', () => {
  useUserStore.setState({ isOnboardingCompleted: false });
  render(<SectionOnboardingCard sectionKey="home"><p>Existing workspace</p></SectionOnboardingCard>);
  expect(screen.getByText('Existing workspace')).toBeVisible();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
});
it('covers every sidebar destination and has complete guidance in four languages', () => {
  for (const tab of SIDEBAR_NAV_TAB_TYPES) expect(sectionForTab(tab)).toBeDefined();
  for (const key of SECTION_KEYS) {
    const guide = getSectionGuide(key)!;
    for (const lng of ['en', 'es', 'fr', 'pt']) {
      for (const text of [guide.titleKey, ...guide.stepKeys]) expect(i18n.exists(text, { lng })).toBe(true);
    }
  }
});
it('retains the guide when persistence fails', async () => {
  vi.mocked(setDismissedTours).mockRejectedValueOnce(new Error('disk'));
  render(<SectionOnboardingCard sectionKey="home" />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('sectionGuide.setup.skip') }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(useSectionTourStore.getState().seen.home).toBeUndefined();
});

it('tracks reviewed explanations without marking actions completed', async () => {
  render(<SectionOnboardingCard sectionKey="home" />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  await waitFor(() => expect(useSectionTourStore.getState().seen['home:reviewed:0']).toBe(true));
  expect(screen.getByText('1 of 3 steps reviewed')).toBeVisible();
  expect(useSectionTourStore.getState().seen.home).toBeUndefined();
});
it('keeps an existing editor mounted and preserves its draft while reopening the guide', async () => {
  useSectionTourStore.setState({ seen: { editor: true } });
  render(<SectionOnboardingCard sectionKey="editor"><input aria-label="Draft" defaultValue="Keep this work" /></SectionOnboardingCard>);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Unsaved edits' } });
  fireEvent.click(screen.getByRole('button', { name: 'Getting started' }));
  expect(input).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Explore this section' }));
  await waitFor(() => expect(input).toBeVisible());
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('Unsaved edits');
});

it('keeps direct settings destinations accessible and offers the guide on demand', () => {
  render(<SectionOnboardingCard sectionKey="settings" autoOpen={false}><p>Account settings</p></SectionOnboardingCard>);
  expect(screen.getByText('Account settings')).toBeVisible();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Getting started' }));
  expect(screen.getByRole('heading')).toBeVisible();
  expect(screen.getByText('Account settings')).not.toBeVisible();
});
