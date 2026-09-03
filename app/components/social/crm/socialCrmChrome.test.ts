import { describe, expect, it } from 'vitest';
import { socialNetworkTitle } from './socialCrmChrome';

describe('socialNetworkTitle', () => {
  const accounts = [
    { id: 'ig-1', provider: 'instagram' as const },
    { id: 'li-1', provider: 'linkedin' as const },
  ];

  it('names the selected network, not the account id', () => {
    expect(socialNetworkTitle(accounts, 'ig-1', 'Todas las redes')).toBe('Instagram');
    expect(socialNetworkTitle(accounts, 'missing', 'Todas las redes')).toBe('Todas las redes');
  });

  it('collapses a single connected network and otherwise stays generic', () => {
    expect(
      socialNetworkTitle([{ id: 'ig-1', provider: 'instagram' }], 'all', 'Todas las redes'),
    ).toBe('Instagram');
    expect(socialNetworkTitle(accounts, 'all', 'Todas las redes')).toBe('Todas las redes');
    expect(socialNetworkTitle([], 'all', 'Todas las redes')).toBe('Todas las redes');
  });
});
