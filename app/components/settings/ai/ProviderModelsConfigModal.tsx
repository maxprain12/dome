import { HugeiconsIcon } from '@hugeicons/react';
import {
  Loading03Icon as Loader2,
  MinusSignIcon as Minus,
  PlusSignIcon as Plus,
  RotateLeft01Icon as RotateCcw,
  Search01Icon as Search,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

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
import { cn } from '@/lib/utils';

import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
const CATALOG_FETCH_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
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

function mergeCatalog(staticModels: ModelDefinition[], fetched: ModelDefinition[]): ModelDefinition[] {
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

      let merged: ModelDefinition[] = staticModels;

      if (CATALOG_FETCH_PROVIDERS.includes(provider)) {
        const keyResult = await db.getSetting(`ai_api_key_${provider}`);
        const legacy = keyResult.data ? null : await db.getSetting('ai_api_key');
        const apiKey = (keyResult.data || legacy?.data || '').trim();
        const res = await fetchProviderModels(provider, apiKey);
        if (res.success && res.models?.length) {
          merged = mergeCatalog(staticModels, rowsToDefinitions(res.models));
        } else if (staticModels.length) {
          merged = staticModels;
          if (res.error && provider !== 'opencode' && provider !== 'opencode-go') {
            setError(res.error);
          }
        } else {
          merged = [];
          setError(res.error ?? t('settings.ai.models_error'));
        }
      } else {
        merged = getStaticProviderCatalog(provider);
      }
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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{t('settings.ai.visible_models.title')}</DialogTitle>{t('settings.ai.visible_models.subtitle', { provider: providerLabel }) ? <DialogDescription className="truncate">{t('settings.ai.visible_models.subtitle', { provider: providerLabel })}</DialogDescription> : null}</div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <HugeiconsIcon icon={Search}
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
            aria-hidden
          />
          <Input className="gap-0 pl-9" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('settings.ai.visible_models.search')} />
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Loader2} className="size-4 animate-spin" aria-hidden />
            {t('settings.ai.models_loading')}
          </p>
        ) : null}

        {error && !loading ? (
          <p className="text-xs text-[var(--warning)]">{error}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="min-h-[240px] rounded-xl border border-border bg-card">
            <header className="border-b border-border px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('settings.ai.visible_models.catalog')}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {t('settings.ai.visible_models.catalog_hint')}
              </p>
            </header>
            <ul className="max-h-64 overflow-y-auto p-2 flex flex-col gap-1">
              {catalogModels.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t('settings.ai.visible_models.empty_catalog')}
                </li>
              ) : (
                catalogModels.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5',
                      'hover:bg-accent transition-colors',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{m.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</p>
                    </div>
                    <Button type="button"
  variant="ghost"
  aria-label={t('settings.ai.visible_models.add')}
  onClick={() => addModel(m.id)}
  size="icon-xs">
                      <HugeiconsIcon icon={Plus} className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="min-h-[240px] rounded-xl border border-border bg-card">
            <header className="border-b border-border px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('settings.ai.visible_models.in_selector')}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {t('settings.ai.visible_models.in_selector_hint', { count: visibleIds.length })}
              </p>
            </header>
            <ul className="max-h-64 overflow-y-auto p-2 flex flex-col gap-1">
              {visibleModels.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t('settings.ai.visible_models.empty_visible')}
                </li>
              ) : (
                visibleModels.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-background border border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{m.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</p>
                    </div>
                    <Button type="button"
  variant="ghost"
  aria-label={t('settings.ai.visible_models.remove')}
  onClick={() => removeModel(m.id)}
  size="icon-xs">
                      <HugeiconsIcon icon={Minus} className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {t('settings.ai.visible_models.add_by_id')}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
            {t('settings.ai.visible_models.add_by_id_hint')}
          </p>
          <div className="flex gap-2">
            <Input className="flex-1 gap-0" value={customIdDraft} onChange={(e) => setCustomIdDraft(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addCustomById();
                }
              }} placeholder={t('settings.ai.visible_models.add_by_id_placeholder')} autoComplete="off" />
            <Button type="button"
  variant="outline"
  disabled={!customIdDraft.trim()}
  onClick={() => void addCustomById()}
  size="sm">
              {t('common.add')}
            </Button>
          </div>
        </div>
      </div>
    </div><DialogFooter className="border-t px-4 py-3">{<div className="flex w-full items-center justify-between gap-3">
          <Button type="button"
  variant="ghost"
  onClick={resetDefaults}
  size="sm">{<HugeiconsIcon icon={RotateCcw} className="size-3.5" aria-hidden />}
            {t('settings.ai.visible_models.reset')}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button"
  variant="ghost"
  onClick={onClose}
  size="sm">
              {t('common.cancel')}
            </Button>
            <Button type="button"
  disabled={saving || visibleIds.length === 0}
  onClick={() => void handleSave()}
  size="sm">
              {saving ? t('common.saving') : t('settings.ai.visible_models.save')}
            </Button>
          </div>
        </div>}</DialogFooter></DialogContent></Dialog>
  );
}
