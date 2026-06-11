import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProviderModels, type ProviderModelRow } from '@/lib/ai/client';
import {
  FREE_COST,
  PROVIDERS,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import type { ModelInputType } from '@/lib/ai/types';

const CLOUD_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'dome',
  'opencode',
  'opencode-go',
];

/** Local catalog from @dome/ai — no remote /models API or API key required. */
const CATALOG_PROVIDERS: AIProviderType[] = ['opencode', 'opencode-go'];

function isDynamicCloudProvider(provider: AIProviderType): boolean {
  return CLOUD_PROVIDERS.includes(provider);
}

function rowsToDefinitions(rows: ProviderModelRow[]): ModelDefinition[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    reasoning: r.reasoning,
    input: [...r.input] as ModelInputType[],
    contextWindow: r.contextWindow,
    maxTokens: r.maxTokens,
    recommended: r.recommended,
    description: r.description,
    api: r.api as ModelDefinition['api'],
    cost: FREE_COST,
  }));
}

function mergeModelDefinitions(
  staticModels: ModelDefinition[],
  fetched: ModelDefinition[],
): ModelDefinition[] {
  const map = new Map(staticModels.map((m) => [m.id, { ...m }]));
  for (const row of fetched) {
    const existing = map.get(row.id);
    if (existing) {
      map.set(row.id, {
        ...existing,
        name: row.name || existing.name,
        contextWindow: row.contextWindow || existing.contextWindow,
        reasoning: row.reasoning,
        input: row.input.length ? row.input : existing.input,
        description: row.description ?? existing.description,
        recommended: existing.recommended || row.recommended,
      });
    } else {
      map.set(row.id, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface UseProviderModelsOptions {
  provider: AIProviderType;
  apiKey?: string;
  /** When false, skip auto-fetch (manual refresh only). Default true. */
  autoFetch?: boolean;
}

export function useProviderModels({
  provider,
  apiKey = '',
  autoFetch = true,
}: UseProviderModelsOptions) {
  const { t } = useTranslation();
  const staticModels = useMemo(
    () => PROVIDERS[provider]?.models ?? [],
    [provider],
  );
  const [mergedModels, setMergedModels] = useState<ModelDefinition[]>(staticModels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMergedModels(staticModels);
    setError(null);
  }, [provider, staticModels]);

  const load = useCallback(async () => {
    if (!isDynamicCloudProvider(provider)) {
      setMergedModels(staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    if (provider === 'dome') {
      setMergedModels(staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    const key = apiKey.trim();
    if (!key && !CATALOG_PROVIDERS.includes(provider)) {
      setMergedModels(staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetchProviderModels(provider, key);
      if (!res.success || !res.models?.length) {
        setError(res.error ?? t('settings.ai.models_error'));
        setMergedModels(staticModels);
      } else {
        setMergedModels(mergeModelDefinitions(staticModels, rowsToDefinitions(res.models)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.models_error'));
      setMergedModels(staticModels);
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, staticModels, t]);

  useEffect(() => {
    if (!autoFetch) return;
    const handle = window.setTimeout(() => {
      void load();
    }, 500);
    return () => window.clearTimeout(handle);
  }, [autoFetch, load]);

  return {
    models: mergedModels,
    loading,
    error,
    refresh: load,
    canRefresh: isDynamicCloudProvider(provider) && provider !== 'dome',
  };
}
