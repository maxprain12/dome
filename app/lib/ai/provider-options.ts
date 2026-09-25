/**
 * Shared AI provider options for onboarding and settings.
 * Single source of truth for order, labels, descriptions, badges, and brand logos.
 */

import { PROVIDERS } from '@/lib/ai/models';

export type ProviderOptionBadgeColor = 'green' | 'purple';
export const DOME_PROVIDER_ENABLED = import.meta.env.VITE_ENABLE_DOME_PROVIDER === 'true';

/** Brand logo paths under public/brandlogo/; `null` renders a monogram (never another brand's mark). */
const PROVIDER_LOGO_PATHS = {
  dome: '/many.png',
  openai: '/brandlogo/OpenAI-black-monoblossom.svg',
  anthropic: '/brandlogo/anthropic.svg',
  google: '/brandlogo/googlegemini.svg',
  openrouter: '/brandlogo/openrouter.svg',
  minimax: '/brandlogo/minimax.svg',
  ollama: '/brandlogo/ollama.svg',
  deepseek: '/brandlogo/deepseek.svg',
  moonshot: '/brandlogo/moonshot.svg',
  qwen: '/brandlogo/qwen.svg',
  copilot: '/brandlogo/github.svg',
  'claude-oauth': '/brandlogo/anthropic.svg',
  'openai-codex': '/brandlogo/OpenAI-black-monoblossom.svg',
  opencode: '/brandlogo/opencode.svg',
  'opencode-go': '/brandlogo/opencode-go.svg',
  vllm: '/brandlogo/vllm.svg',
  lmstudio: '/brandlogo/lmstudio.svg',
  xai: null,
  groq: null,
  mistral: null,
  fireworks: null,
  together: null,
  'google-vertex': '/brandlogo/googlegemini.svg',
  'azure-openai-responses': '/brandlogo/OpenAI-black-monoblossom.svg',
} as const satisfies Record<string, string | null>;

export type ProviderWithBrandLogo = keyof typeof PROVIDER_LOGO_PATHS;

export type ResolvedTheme = 'light' | 'dark';

/** Light-theme variants (official OpenCode brand assets). */
const PROVIDER_LOGO_LIGHT_PATHS: Partial<Record<ProviderWithBrandLogo, string>> = {
  opencode: '/brandlogo/opencode-light.svg',
  'opencode-go': '/brandlogo/opencode-go-light.svg',
};

export function getProviderLogoSrc(
  provider: ProviderWithBrandLogo,
  resolvedTheme: ResolvedTheme = 'dark',
): string | null {
  if (resolvedTheme === 'light') {
    const light = PROVIDER_LOGO_LIGHT_PATHS[provider];
    if (light) return light;
  }
  return PROVIDER_LOGO_PATHS[provider];
}

/** Monochrome logos (Simple Icons) need --dome-logo-filter in dark theme. */
const PROVIDER_LOGO_DARK_INVERT = new Set<ProviderWithBrandLogo>([
  'copilot',
  'deepseek',
  'moonshot',
  'ollama',
  'qwen',
]);

export function providerLogoUsesDarkInvert(provider: ProviderWithBrandLogo): boolean {
  return PROVIDER_LOGO_DARK_INVERT.has(provider);
}

export function isProviderWithBrandLogo(provider: string): provider is ProviderWithBrandLogo {
  return provider in PROVIDER_LOGO_PATHS;
}

export interface ProviderOption {
  value: ProviderWithBrandLogo;
  label: string;
  description: string;
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
  },
  {
    value: 'anthropic',
    label: PROVIDERS.anthropic.name,
    description: PROVIDERS.anthropic.description + '. Requires API key.',
  },
  {
    value: 'google',
    label: PROVIDERS.google.name,
    description: PROVIDERS.google.description + '. Requires API key.',
  },
  {
    value: 'openrouter',
    label: PROVIDERS.openrouter.name,
    description: PROVIDERS.openrouter.description + '. Requires OpenRouter API key.',
  },
  {
    value: 'opencode',
    label: PROVIDERS.opencode.name,
    description: PROVIDERS.opencode.description + '. Requires OpenCode API key.',
  },
  {
    value: 'opencode-go',
    label: PROVIDERS['opencode-go'].name,
    description: PROVIDERS['opencode-go'].description + '. Requires OpenCode API key.',
  },
  {
    value: 'dome',
    label: PROVIDERS.dome.name,
    description: DOME_PROVIDER_ENABLED
      ? PROVIDERS.dome.description + '. Connect with OAuth.'
      : 'Próximamente',
    recommended: DOME_PROVIDER_ENABLED,
    badge: DOME_PROVIDER_ENABLED ? 'NEW' : 'PRÓXIMAMENTE',
    badgeColor: 'green',
    disabled: !DOME_PROVIDER_ENABLED,
  },
  {
    value: 'minimax',
    label: PROVIDERS.minimax.name,
    description: 'MiniMax M-series via Anthropic-compatible API. M3 supports image & video. Requires sk-cp-... key.',
  },
  {
    value: 'deepseek',
    label: PROVIDERS.deepseek.name,
    description: PROVIDERS.deepseek.description + '. Requires API key.',
  },
  {
    value: 'moonshot',
    label: PROVIDERS.moonshot.name,
    description: PROVIDERS.moonshot.description + '. Requires API key.',
  },
  {
    value: 'qwen',
    label: PROVIDERS.qwen.name,
    description: PROVIDERS.qwen.description + '. Requires API key.',
  },
  {
    value: 'copilot',
    label: PROVIDERS.copilot.name,
    description: PROVIDERS.copilot.description + '. Connect with GitHub.',
  },
  {
    value: 'claude-oauth',
    label: PROVIDERS['claude-oauth'].name,
    description: PROVIDERS['claude-oauth'].description + '. Experimental — not an official integration.',
    badge: 'EXPERIMENTAL',
    badgeColor: 'purple',
  },
  {
    value: 'openai-codex',
    label: PROVIDERS['openai-codex'].name,
    description: PROVIDERS['openai-codex'].description + '. Experimental — not an official integration.',
    badge: 'EXPERIMENTAL',
    badgeColor: 'purple',
  },
  {
    value: 'ollama',
    label: PROVIDERS.ollama.name,
    description: PROVIDERS.ollama.description + '. Requires Ollama installed.',
  },
  {
    value: 'lmstudio',
    label: PROVIDERS.lmstudio.name,
    description: PROVIDERS.lmstudio.description + '. Requires LM Studio running.',
  },
  {
    value: 'vllm',
    label: PROVIDERS.vllm.name,
    description: PROVIDERS.vllm.description + '. Requires a vLLM server.',
  },
  {
    value: 'xai',
    label: PROVIDERS.xai.name,
    description: PROVIDERS.xai.description + '. Requires API key.',
  },
  {
    value: 'groq',
    label: PROVIDERS.groq.name,
    description: PROVIDERS.groq.description + '. Requires API key.',
  },
  {
    value: 'mistral',
    label: PROVIDERS.mistral.name,
    description: PROVIDERS.mistral.description + '. Requires API key.',
  },
  {
    value: 'fireworks',
    label: PROVIDERS.fireworks.name,
    description: PROVIDERS.fireworks.description + '. Requires API key.',
  },
  {
    value: 'together',
    label: PROVIDERS.together.name,
    description: PROVIDERS.together.description + '. Requires API key.',
  },
  {
    value: 'google-vertex',
    label: PROVIDERS['google-vertex'].name,
    description: PROVIDERS['google-vertex'].description + '. Requires Google Cloud credentials.',
  },
  {
    value: 'azure-openai-responses',
    label: PROVIDERS['azure-openai-responses'].name,
    description: PROVIDERS['azure-openai-responses'].description + '. Requires Azure API key.',
  },
];
