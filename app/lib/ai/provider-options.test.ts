import { expect, it } from 'vitest';
import { AI_PROVIDER_OPTIONS, getProviderLogoSrc, providerLogoUsesDarkInvert } from './provider-options';
it('ships a local brand asset for every selectable provider in both themes', () => {
  for (const provider of AI_PROVIDER_OPTIONS) for (const theme of ['light', 'dark'] as const) {
    expect(getProviderLogoSrc(provider.value, theme)).toMatch(/^\/(brandlogo\/.*\.svg|many\.png)$/);
  }
});
it('keeps distinct product identities and readable monochrome logos', () => {
  expect(getProviderLogoSrc('copilot')).not.toMatch(/\/github\.svg$/);
  expect(getProviderLogoSrc('claude-oauth')).not.toBe(getProviderLogoSrc('anthropic'));
  expect(getProviderLogoSrc('google-vertex')).not.toBe(getProviderLogoSrc('google'));
  expect(getProviderLogoSrc('azure-openai-responses')).not.toBe(getProviderLogoSrc('openai'));
  expect(providerLogoUsesDarkInvert('openai')).toBe(true);
  expect(providerLogoUsesDarkInvert('anthropic')).toBe(true);
  expect(providerLogoUsesDarkInvert('mistral')).toBe(false);
});
