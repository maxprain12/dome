import type { AISettings } from '@/types';
import { PROVIDERS, getDefaultModelId, type AIProviderType } from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';

export type DomeQuota = {
  planId?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  periodEnd?: number;
  subscriptionStatus?: string;
};

export type TestResult = { success: boolean; message: string };

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

/** Normalize persisted AI config into renderer state fields. */
export function parseLoadedAIConfig(config: AISettings): {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  customModel: boolean;
  ollamaBaseURL: string;
  ollamaModel: string;
  ollamaApiKey: string;
} {
  const loadedProviderBase = (config.provider as string) === 'local' ? 'ollama' : config.provider;
  const loadedProvider =
    loadedProviderBase === 'dome' && !DOME_PROVIDER_ENABLED ? 'openai' : loadedProviderBase;
  const provider = loadedProvider as AIProviderType;
  const defaultModel = getDefaultModelId(provider);
  // Dome Cloud rejects bare OpenAI ids (gpt-5.6-sol); catalog uses vendor/model.
  const loadedModel = config.model || defaultModel;
  const domeSafeModel =
    provider === 'dome' && loadedModel !== 'dome/auto' && !loadedModel.includes('/')
      ? 'dome/auto'
      : loadedModel;
  const providerModels = PROVIDERS[provider]?.models || [];
  // Dome: plan models come from the provider (not the static catalog) — not "custom".
  const customModel =
    provider !== 'dome' &&
    Boolean(config.model) &&
    !providerModels.find((m) => m.id === config.model);

  return {
    provider,
    apiKey: config.api_key || '',
    model: domeSafeModel,
    customModel,
    ollamaBaseURL: config.ollama_base_url || 'http://localhost:11434',
    ollamaModel: config.ollama_model || 'llama3.2',
    ollamaApiKey: config.ollama_api_key || '',
  };
}

export type AISaveInput = {
  provider: AIProviderType;
  model: string;
  apiKey: string;
  ollamaBaseURL: string;
  ollamaModel: string;
  ollamaApiKey: string;
};

/** Build the Partial<AISettings> payload for saveAIConfig. */
export function buildAISaveConfig(input: AISaveInput): Partial<AISettings> {
  const { provider, model, apiKey, ollamaBaseURL, ollamaModel, ollamaApiKey } = input;
  const config: Partial<AISettings> = { provider };
  switch (provider) {
    case 'dome':
      config.model = model || 'dome/auto';
      config.base_url = '';
      break;
    case 'copilot':
    case 'claude-oauth':
    case 'openai-codex':
      config.model = model;
      config.base_url = '';
      break;
    case 'ollama':
      config.ollama_base_url = ollamaBaseURL;
      config.ollama_model = ollamaModel;
      config.ollama_api_key = ollamaApiKey;
      break;
    case 'minimax':
      config.api_key = apiKey;
      config.model = model;
      break;
    default:
      config.api_key = apiKey;
      config.model = model;
      config.base_url = '';
      break;
  }
  return config;
}

/** Load a cloud provider API key from settings (masked), or empty string. */
export async function loadCloudApiKey(provider: AIProviderType): Promise<string> {
  if (!isCloudAIProvider(provider)) return '';
  try {
    const { db } = await import('@/lib/db/client');
    const res = await db.getSetting(`ai_api_key_${provider}`);
    return res.data || '';
  } catch {
    return '';
  }
}
