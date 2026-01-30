/**
 * Shared AI provider options for onboarding and settings.
 * Single source of truth for order, labels, descriptions, badges, and icons.
 */

import { Cpu, Gift, Globe, Shield, Sparkles, Zap } from 'lucide-react';
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

/** Order: Gratis first, then Cloud (OpenAI, Anthropic, Google, Venice), then Local (Ollama). */
export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'synthetic',
    label: 'Synthetic',
    description: '19 free models: MiniMax, DeepSeek, Qwen, Llama',
    icon: Gift,
    badge: 'GRATIS',
    badgeColor: 'green',
    recommended: true,
  },
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
    value: 'venice',
    label: 'Venice',
    description: 'Models with total privacy, no logging.',
    icon: Shield,
    badge: 'PRIVADO',
    badgeColor: 'purple',
  },
  {
    value: 'ollama',
    label: PROVIDERS.ollama.name,
    description: PROVIDERS.ollama.description + '. Requires Ollama installed.',
    icon: Cpu,
  },
];
