/**
 * Shared AI provider options for onboarding and settings.
 * Single source of truth for order, labels, descriptions, badges, and brand logos.
 */

import { PROVIDERS } from '@/lib/ai/models';

export type ProviderOptionBadgeColor = 'green' | 'purple';
export const DOME_PROVIDER_ENABLED = import.meta.env.VITE_ENABLE_DOME_PROVIDER === 'true';

/** Brand logo paths under public/brandlogo/. */
const PROVIDER_LOGO_PATHS = {
  dome: '/many.png',
  openai: '/brandlogo/OpenAI-black-monoblossom.svg',
  anthropic: '/brandlogo/anthropic.svg',
  google: '/brandlogo/googlegemini.svg',
  openrouter: '/brandlogo/openrouter.svg',
  minimax: '/brandlogo/minimax.svg',
  ollama: '/brandlogo/ollama.svg',
} as const;

export type ProviderWithBrandLogo = keyof typeof PROVIDER_LOGO_PATHS;

export const DOME_BRAND_LOGO_SRC = PROVIDER_LOGO_PATHS.dome;

export function getProviderLogoSrc(provider: ProviderWithBrandLogo): string {
  return PROVIDER_LOGO_PATHS[provider];
}

export function isProviderWithBrandLogo(provider: string): provider is ProviderWithBrandLogo {
  return provider in PROVIDER_LOGO_PATHS;
}

export interface ProviderOption {
  value: ProviderWithBrandLogo;
  label: string;
  description: string;
  logoSrc: string;
  badge?: string;
  badgeColor?: ProviderOptionBadgeColor;
  recommended?: boolean;
  disabled?: boolean;
}

/** Order: Cloud (OpenAI, Anthropic, Google), then Local (Ollama). */
export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'openai',
    label: PROVIDERS.openai.name,
    description: PROVIDERS.openai.description + '. Requires API key.',
    logoSrc: PROVIDER_LOGO_PATHS.openai,
  },
  {
    value: 'anthropic',
    label: PROVIDERS.anthropic.name,
    description: PROVIDERS.anthropic.description + '. Requires API key.',
    logoSrc: PROVIDER_LOGO_PATHS.anthropic,
  },
  {
    value: 'google',
    label: PROVIDERS.google.name,
    description: PROVIDERS.google.description + '. Requires API key.',
    logoSrc: PROVIDER_LOGO_PATHS.google,
  },
  {
    value: 'openrouter',
    label: PROVIDERS.openrouter.name,
    description: PROVIDERS.openrouter.description + '. Requires OpenRouter API key.',
    logoSrc: PROVIDER_LOGO_PATHS.openrouter,
  },
  {
    value: 'dome',
    label: PROVIDERS.dome.name,
    description: DOME_PROVIDER_ENABLED
      ? PROVIDERS.dome.description + '. Connect with OAuth.'
      : 'Próximamente',
    logoSrc: PROVIDER_LOGO_PATHS.dome,
    recommended: DOME_PROVIDER_ENABLED,
    badge: DOME_PROVIDER_ENABLED ? 'NEW' : 'PRÓXIMAMENTE',
    badgeColor: 'green',
    disabled: !DOME_PROVIDER_ENABLED,
  },
  {
    value: 'minimax',
    label: PROVIDERS.minimax.name,
    description: 'MiniMax M2.5 via Anthropic-compatible API. Requires sk-cp-... key.',
    logoSrc: PROVIDER_LOGO_PATHS.minimax,
  },
  {
    value: 'ollama',
    label: PROVIDERS.ollama.name,
    description: PROVIDERS.ollama.description + '. Requires Ollama installed.',
    logoSrc: PROVIDER_LOGO_PATHS.ollama,
  },
];
