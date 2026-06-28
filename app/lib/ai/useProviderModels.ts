import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchProviderModels, getCustomModelsByProvider, type ProviderModelRow } from '@/lib/ai/client';
import { getCopilotModels } from '@/lib/ai/catalogs/copilot';
import {
  FREE_COST,
  PROVIDERS,
  type AIProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import type { ModelInputType } from '@/lib/ai/types';
import {
  filterModelsByVisibleIds,
  getDefaultVisibleModelIds,
  getStaticProviderCatalog,
  getVisibleModelIds,
} from '@/lib/ai/visible-models';

const CLOUD_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'deepseek',
  'moonshot',
  'qwen',
  'copilot',
  'dome',
  'opencode',
  'opencode-go',
];

/** Local catalog from @dome/ai — no remote /models API or API key required. */
const CATALOG_PROVIDERS: AIProviderType[] = ['opencode', 'opencode-go'];

const STATIC_CATALOG_PROVIDERS: AIProviderType[] = ['deepseek', 'moonshot', 'qwen', 'copilot'];

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

function mergeCustomModelDefinitions(
  models: ModelDefinition[],
  customIds: string[],
): ModelDefinition[] {
  if (!customIds.length) return models;
  const map = new Map(models.map((m) => [m.id, m]));
  for (const id of customIds) {
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: id,
        reasoning: false,
        input: ['text'] as ModelInputType[],
        contextWindow: 0,
        maxTokens: 0,
        cost: FREE_COST,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface UseProviderModelsOptions {
  provider: AIProviderType;
  apiKey?: string;
  /** When false, skip auto-fetch (manual refresh only). Default true. */
  autoFetch?: boolean;
  /** When false, return full catalog (for the visible-models modal). Default true. */
  applyVisibleFilter?: boolean;
}

export function useProviderModels({
  provider,
  apiKey = '',
  autoFetch = true,
  applyVisibleFilter = true,
}: UseProviderModelsOptions) {
  const { t } = useTranslation();
  const staticModels = useMemo(
    () => PROVIDERS[provider]?.models ?? [],
    [provider],
  );
  const [mergedModels, setMergedModels] = useState<ModelDefinition[]>(staticModels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>(() => getDefaultVisibleModelIds(provider));

  const [prevProvider, setPrevProvider] = useState(provider);
  const [prevStaticModels, setPrevStaticModels] = useState(staticModels);
  if (provider !== prevProvider || staticModels !== prevStaticModels) {
    setPrevProvider(provider);
    setPrevStaticModels(staticModels);
    setMergedModels(staticModels);
    setError(null);
  }

  useEffect(() => {
    if (!applyVisibleFilter) return;
    let cancelled = false;
    void getVisibleModelIds(provider).then((ids) => {
      if (!cancelled) setVisibleIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, applyVisibleFilter]);

  useEffect(() => {
    if (!applyVisibleFilter) return;
    const onVisibleChange = () => {
      void getVisibleModelIds(provider).then(setVisibleIds);
    };
    window.addEventListener('dome:ai-visible-models-changed', onVisibleChange);
    return () => window.removeEventListener('dome:ai-visible-models-changed', onVisibleChange);
  }, [provider, applyVisibleFilter]);

  const applyFilter = useCallback(
    async (models: ModelDefinition[]) => {
      const customMap = await getCustomModelsByProvider();
      const withCustom = mergeCustomModelDefinitions(models, customMap[provider] ?? []);
      if (!applyVisibleFilter) return withCustom;
      return filterModelsByVisibleIds(withCustom, visibleIds);
    },
    [applyVisibleFilter, visibleIds, provider],
  );

  const load = useCallback(async () => {
    const finish = async (models: ModelDefinition[]) => {
      setMergedModels(await applyFilter(models));
    };
    if (!isDynamicCloudProvider(provider)) {
      await finish(staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    if (provider === 'dome') {
      await finish(staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    if (STATIC_CATALOG_PROVIDERS.includes(provider)) {
      const catalog =
        provider === 'copilot' ? getCopilotModels() : getStaticProviderCatalog(provider);
      await finish(catalog.length ? catalog : staticModels);
      setError(null);
      setLoading(false);
      return;
    }

    const key = apiKey.trim();
    if (!key && !CATALOG_PROVIDERS.includes(provider)) {
      await finish(staticModels);
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
        await finish(staticModels);
      } else {
        await finish(mergeModelDefinitions(staticModels, rowsToDefinitions(res.models)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.models_error'));
      await finish(staticModels);
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, staticModels, t, applyFilter]);

  useEffect(() => {
    if (!autoFetch) return;
    const handle = window.setTimeout(() => {
      void load();
    }, 500);
    return () => window.clearTimeout(handle);
  }, [autoFetch, load, visibleIds]);

  return {
    models: mergedModels,
    loading,
    error,
    refresh: load,
    canRefresh: isDynamicCloudProvider(provider) && provider !== 'dome',
  };
}
