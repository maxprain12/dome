/**
 * Groups the provider catalogue for the Settings → AI list: what you use now,
 * what you already set up, and what you could add — filtered by a search query.
 */

import { isLocalChatProvider, type AIProviderType } from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, type ProviderOption } from '@/lib/ai/provider-options';

export type ProviderGroupKey = 'active' | 'configured' | 'subscription' | 'cloud' | 'local';

export type ProviderKind = 'subscription' | 'cloud' | 'local';

export interface ProviderGroup {
  key: ProviderGroupKey;
  options: ProviderOption[];
}

const SUBSCRIPTION_PROVIDERS = new Set<AIProviderType>(['dome', 'copilot', 'claude-oauth', 'openai-codex']);

export function providerKind(provider: AIProviderType): ProviderKind {
  if (SUBSCRIPTION_PROVIDERS.has(provider)) return 'subscription';
  if (isLocalChatProvider(provider)) return 'local';
  return 'cloud';
}

function matches(option: ProviderOption, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q);
}

export interface GroupProviderOptionsInput {
  active: AIProviderType | null;
  configured: Record<string, boolean>;
  query?: string;
  hideDome?: boolean;
  options?: ProviderOption[];
}

/** Non-empty groups in display order; each provider appears once. */
export function groupProviderOptions({
  active,
  configured,
  query = '',
  hideDome = false,
  options = AI_PROVIDER_OPTIONS,
}: GroupProviderOptionsInput): ProviderGroup[] {
  const q = query.trim();
  const visible = options.filter(
    (option) => !option.disabled && !(hideDome && option.value === 'dome') && matches(option, q),
  );

  const buckets: Record<ProviderGroupKey, ProviderOption[]> = {
    active: [],
    configured: [],
    subscription: [],
    cloud: [],
    local: [],
  };
  for (const option of visible) {
    if (option.value === active) buckets.active.push(option);
    else if (providerKind(option.value) === 'local') buckets.local.push(option);
    else if (configured[option.value]) buckets.configured.push(option);
    else buckets[providerKind(option.value)].push(option);
  }

  const order: ProviderGroupKey[] = ['active', 'configured', 'subscription', 'cloud', 'local'];
  return order.filter((key) => buckets[key].length > 0).map((key) => ({ key, options: buckets[key] }));
}
