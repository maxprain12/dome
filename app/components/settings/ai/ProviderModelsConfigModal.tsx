import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  MinusSignIcon,
  PlusSignIcon,
  RotateLeft01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { db } from '@/lib/db/client';
import { fetchProviderModels, getCustomModelsByProvider } from '@/lib/ai/client';
import {
  addCustomModelToProvider,
  getDefaultVisibleModelIds,
  getStaticProviderCatalog,
  isVisibleModelsConfigurable,
  setVisibleModelIds,
} from '@/lib/ai/visible-models';
import { PROVIDERS, type AIProviderType, type ModelDefinition } from '@/lib/ai/models';
import type { ModelInputType } from '@/lib/ai/types';

const CATALOG_FETCH_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'claude-oauth',
  'openai-codex',
  'opencode',
  'opencode-go',
];

export interface ProviderModelsConfigModalProps {
  open: boolean;
  provider: AIProviderType | null;
  onClose: () => void;
  /** Called after save with provider and final visible id list. */
  onSaved?: (provider: AIProviderType, visibleIds: string[]) => void;
}

function rowsToDefinitions(
  rows: NonNullable<Awaited<ReturnType<typeof fetchProviderModels>>['models']>,
): ModelDefinition[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    reasoning: r.reasoning,
    input: [...r.input],
    contextWindow: r.contextWindow,
    maxTokens: r.maxTokens,
    recommended: r.recommended,
    description: r.description,
    api: r.api as ModelDefinition['api'],
  }));
}

function mergeCatalog(
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
      });
    } else {
      map.set(row.id, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

type FetchMergedCatalogResult = {
  merged: ModelDefinition[];
  error?: string;
};

async function fetchMergedCatalog(
  provider: AIProviderType,
  staticModels: ModelDefinition[],
  t: TFunction,
): Promise<FetchMergedCatalogResult> {
  if (!CATALOG_FETCH_PROVIDERS.includes(provider)) {
    return { merged: getStaticProviderCatalog(provider) };
  }

  const keyResult = await db.getSetting(`ai_api_key_${provider}`);
  const legacy = keyResult.data ? null : await db.getSetting('ai_api_key');
  const apiKey = (keyResult.data || legacy?.data || '').trim();
  const res = await fetchProviderModels(provider, apiKey);

  if (res.success && res.models?.length) {
    return { merged: mergeCatalog(staticModels, rowsToDefinitions(res.models)) };
  }

  if (!staticModels.length) {
    return { merged: [], error: res.error ?? t('settings.ai.models_error') };
  }

  if (res.error && provider !== 'opencode' && provider !== 'opencode-go') {
    return { merged: staticModels, error: res.error };
  }
  return { merged: staticModels };
}

/** Two-column curator: full provider catalog on the left, visible selector list on the right. */
export default function ProviderModelsConfigModal({
  open,
  provider,
  onClose,
  onSaved,
}: ProviderModelsConfigModalProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ModelDefinition[]>([]);
  const [visibleIds, setVisibleIdsState] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [customIdDraft, setCustomIdDraft] = useState('');

  const mergeCustomIntoCatalog = useCallback(
    (base: ModelDefinition[], customIds: string[]): ModelDefinition[] => {
      if (!customIds.length) return base;
      const map = new Map(base.map((m) => [m.id, m]));
      for (const id of customIds) {
        if (!map.has(id)) {
          map.set(id, {
            id,
            name: id,
            reasoning: false,
            input: ['text'] as ModelInputType[],
            contextWindow: 0,
            maxTokens: 0,
            description: t('settings.ai.visible_models.custom_model_badge'),
          });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    [t],
  );

  const load = useCallback(async () => {
    if (!provider || !isVisibleModelsConfigurable(provider)) return;
    setLoading(true);
    setError(null);
    try {
      const { getVisibleModelIds } = await import('@/lib/ai/visible-models');
      const visible = await getVisibleModelIds(provider);
      setVisibleIdsState(visible);
      const customIds = (await getCustomModelsByProvider())[provider] ?? [];

      const staticModels =
        provider === 'copilot'
          ? getStaticProviderCatalog(provider)
          : (PROVIDERS[provider]?.models ?? []);

      const { merged, error: fetchError } = await fetchMergedCatalog(provider, staticModels, t);
      if (fetchError) setError(fetchError);
      setCatalog(mergeCustomIntoCatalog(merged, customIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.models_error'));
      if (provider) setCatalog(getStaticProviderCatalog(provider));
    } finally {
      setLoading(false);
    }
  }, [provider, t, mergeCustomIntoCatalog]);

  const modalOpenKey = open && provider ? `${open}:${provider}` : '';
  const prevModalOpenKeyRef = useRef(modalOpenKey);
  if (modalOpenKey && modalOpenKey !== prevModalOpenKeyRef.current) {
    prevModalOpenKeyRef.current = modalOpenKey;
    setSearch('');
    setCustomIdDraft('');
  }

  useEffect(() => {
    if (!open || !provider) return;
    void load();
  }, [open, provider, load]);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const query = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (m: ModelDefinition) =>
      !query ||
      m.id.toLowerCase().includes(query) ||
      m.name.toLowerCase().includes(query) ||
      (m.description?.toLowerCase().includes(query) ?? false),
    [query],
  );

  const visibleModels = useMemo(() => {
    const byId = new Map(catalog.map((m) => [m.id, m]));
    const fallback = (id: string): ModelDefinition => ({
      id,
      name: id,
      reasoning: false,
      input: ['text'] as ModelInputType[],
      contextWindow: 0,
      maxTokens: 0,
    });
    return visibleIds.reduce<ModelDefinition[]>((acc, id) => {
      const model = byId.get(id) ?? fallback(id);
      if (matchesSearch(model)) acc.push(model);
      return acc;
    }, []);
  }, [catalog, visibleIds, matchesSearch]);

  const catalogModels = useMemo(
    () => catalog.filter((m) => !visibleSet.has(m.id) && matchesSearch(m)),
    [catalog, visibleSet, matchesSearch],
  );

  const addModel = (id: string) => {
    if (visibleSet.has(id)) return;
    setVisibleIdsState((prev) => [...prev, id]);
  };

  const removeModel = (id: string) => {
    setVisibleIdsState((prev) => prev.filter((x) => x !== id));
  };

  const resetDefaults = () => {
    if (!provider) return;
    setVisibleIdsState(getDefaultVisibleModelIds(provider));
  };

  const addCustomById = async () => {
    if (!provider) return;
    const id = customIdDraft.trim();
    if (!id) return;
    await addCustomModelToProvider(provider, id);
    setVisibleIdsState((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCatalog((prev) =>
      prev.some((m) => m.id === id)
        ? prev
        : [
            ...prev,
            {
              id,
              name: id,
              reasoning: false,
              input: ['text'] as ModelInputType[],
              contextWindow: 0,
              maxTokens: 0,
              description: t('settings.ai.visible_models.custom_model_badge'),
            },
          ].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setCustomIdDraft('');
  };

  const handleSave = async () => {
    if (!provider || visibleIds.length === 0) return;
    setSaving(true);
    try {
      await setVisibleModelIds(provider, visibleIds);
      onSaved?.(provider, visibleIds);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const providerLabel = provider ? (PROVIDERS[provider]?.name ?? provider) : '';

  const modelRow = (m: ModelDefinition, action: 'add' | 'remove') => (
    <li
      key={m.id}
      className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-muted/50 motion-reduce:transition-none"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{m.name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={
          action === 'add'
            ? t('settings.ai.visible_models.add')
            : t('settings.ai.visible_models.remove')
        }
        onClick={() => (action === 'add' ? addModel(m.id) : removeModel(m.id))}
      >
        <HugeiconsIcon icon={action === 'add' ? PlusSignIcon : MinusSignIcon} aria-hidden />
      </Button>
    </li>
  );

  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="xl">
        <AppModalHeader
          title={t('settings.ai.visible_models.title')}
          description={t('settings.ai.visible_models.subtitle', { provider: providerLabel })}
        />
        <AppModalBody>
          <div className="flex flex-col gap-4">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <HugeiconsIcon icon={Search01Icon} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('settings.ai.visible_models.search')}
                aria-label={t('settings.ai.visible_models.search')}
              />
            </InputGroup>

            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {t('settings.ai.models_loading')}
              </p>
            ) : null}

            {error && !loading ? <p className="text-xs text-warning">{error}</p> : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <section className="min-h-[240px] rounded-xl border bg-card">
                <header className="border-b px-3 py-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.ai.visible_models.catalog')}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    {t('settings.ai.visible_models.catalog_hint')}
                  </p>
                </header>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto p-2">
                  {catalogModels.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {t('settings.ai.visible_models.empty_catalog')}
                    </li>
                  ) : (
                    catalogModels.map((m) => modelRow(m, 'add'))
                  )}
                </ul>
              </section>

              <section className="min-h-[240px] rounded-xl border bg-card">
                <header className="border-b px-3 py-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.ai.visible_models.in_selector')}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    {t('settings.ai.visible_models.in_selector_hint', { count: visibleIds.length })}
                  </p>
                </header>
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto p-2">
                  {visibleModels.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {t('settings.ai.visible_models.empty_visible')}
                    </li>
                  ) : (
                    visibleModels.map((m) => modelRow(m, 'remove'))
                  )}
                </ul>
              </section>
            </div>

            <div className="rounded-xl border border-dashed bg-card p-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {t('settings.ai.visible_models.add_by_id')}
              </p>
              <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                {t('settings.ai.visible_models.add_by_id_hint')}
              </p>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={customIdDraft}
                  onChange={(e) => setCustomIdDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addCustomById();
                    }
                  }}
                  placeholder={t('settings.ai.visible_models.add_by_id_placeholder')}
                  aria-label={t('settings.ai.visible_models.add_by_id')}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!customIdDraft.trim()}
                  onClick={() => void addCustomById()}
                >
                  {t('common.add')}
                </Button>
              </div>
            </div>
          </div>
        </AppModalBody>

        <AppModalFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={resetDefaults}>
              <HugeiconsIcon icon={RotateLeft01Icon} data-icon="inline-start" />
              {t('settings.ai.visible_models.reset')}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || visibleIds.length === 0}
                onClick={() => void handleSave()}
              >
                {saving ? t('common.saving') : t('settings.ai.visible_models.save')}
              </Button>
            </div>
          </div>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
