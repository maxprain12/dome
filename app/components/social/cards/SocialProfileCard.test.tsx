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

it('explains pending source access without recommending browser login or automatic capture', async () => {
  await i18n.changeLanguage('es');
  render(<SocialProfileCard model={{ ...model, provider: 'linkedin', limitations: ['access_pending_enablement'], followers: null }} />);
  expect(screen.getByText(/Importa o pega evidencia.*iniciar sesión no habilita/)).toBeVisible();
  expect(screen.queryByText(/Abre esta página.*capturar/)).not.toBeInTheDocument();
  expect(screen.queryByText(/1,2.*mil/)).not.toBeInTheDocument();
});
