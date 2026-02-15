/**
 * Shared AI provider options for onboarding and settings.
 * Single source of truth for order, labels, descriptions, badges, and icons.
 */

import { Cpu, Globe, Sparkles, Zap } from 'lucide-react';
import { PROVIDERS } from '@/lib/ai/models';
import type { AIProviderType } from '@/lib/ai/models';

export type ProviderOptionBadgeColor = 'green' | 'purple';

export interface ProviderOption {
  value: AIProviderType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: ProviderOptionBadgeColor;
  recommended?: boolean;
}

/** Order: Cloud (OpenAI, Anthropic, Google), then Local (Ollama). */
export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'openai',
    label: PROVIDERS.openai.name,
    description: PROVIDERS.openai.description + '. Requires API key.',
    icon: Sparkles,
  },
  {
    value: 'anthropic',
    label: PROVIDERS.anthropic.name,
    description: PROVIDERS.anthropic.description + '. Requires API key.',
    icon: Zap,
  },
  {
    value: 'google',
    label: PROVIDERS.google.name,
    description: PROVIDERS.google.description + '. Requires API key.',
    icon: Globe,
  },
  {
    value: 'ollama',
    label: PROVIDERS.ollama.name,
    description: PROVIDERS.ollama.description + '. Requires Ollama installed.',
    icon: Cpu,
  },
];
