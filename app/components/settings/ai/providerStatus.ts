import type { TFunction } from 'i18next';
import type { AIProviderType } from '@/lib/ai/models';
import { providerKind, type ProviderKind } from '@/lib/ai/provider-groups';

export type ProviderReadiness = 'ready' | 'needs_setup' | 'local';

export function providerReadiness(provider: AIProviderType, configured: boolean): ProviderReadiness {
  if (providerKind(provider) === 'local') return 'local';
  return configured ? 'ready' : 'needs_setup';
}

/** One-line status for a provider row / detail header, in the UI language. */
export function providerStatusLabel(t: TFunction, provider: AIProviderType, configured: boolean): string {
  const kind = providerKind(provider);
  switch (kind) {
    case 'local':
      return t('settings.ai.private_local');
    case 'subscription':
      return configured ? t('settings.ai.status_connected') : t('settings.ai.status_disconnected');
    case 'cloud':
      return configured ? t('settings.ai.key_saved') : t('settings.ai.api_key_required');
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function providerKindLabel(t: TFunction, kind: ProviderKind): string {
  return t(`settings.ai.provider_kind.${kind}`);
}
