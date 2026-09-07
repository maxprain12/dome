import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SocialAccount } from '@/components/social/socialTypes';
import { SocialComposerWorkspace } from './SocialComposerWorkspace';

const accounts = ['first', 'second'].map((name) => ({
  id: name, provider: 'instagram', status: 'active', handle: `@${name}`,
})) as SocialAccount[];

describe('Social composer destinations', () => {
  it('inherits the second Instagram account from the workspace context', () => {
    render(<SocialComposerWorkspace accounts={accounts} campaigns={[]} post={null} initialAccountId="second" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('@second');
    expect(screen.getAllByRole('combobox')[0]).not.toHaveTextContent('@first');
  });

  it('does not silently select the first account when several are available', () => {
    const linkedin = accounts.map((account) => ({ ...account, provider: 'linkedin' as const }));
    render(<SocialComposerWorkspace accounts={linkedin} campaigns={[]} post={null} onClose={() => {}} onSaved={() => {}} />);
    const destination = screen.getAllByRole('combobox')[0];
    expect(destination).not.toHaveTextContent('@first');
    expect(destination).not.toHaveTextContent('@second');
    expect(destination).toHaveAttribute('aria-invalid', 'true');
  });
});
