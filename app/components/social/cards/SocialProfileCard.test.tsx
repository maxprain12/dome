import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/lib/i18n';
import { SocialProfileCard } from './SocialProfileCard';
import type { SocialEvidenceCardModel } from './socialCardModel';

const model: SocialEvidenceCardModel = {
  kind: 'profile',
  provider: 'instagram',
  title: 'Ada Lovelace',
  author: { name: 'Ada Lovelace', handle: 'ada', avatarUrl: null },
  limitations: ['og_only'],
  fetchMethod: 'open_graph',
  followers: 1200,
};

describe('SocialProfileCard', () => {
  it('renders the human name and honest limitation, not an opaque id', async () => {
    await i18n.changeLanguage('en');
    render(<SocialProfileCard model={model} />);
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getByText(/Public metadata only/i)).toBeVisible();
    expect(screen.queryByText(/sa-|sr-/)).not.toBeInTheDocument();
    expect(document.querySelector('.chat-tool-enter')).toBeTruthy();
  });
});
