import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ChevronDownIcon, Settings01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  fetchProviderModels,
  getAIConfig,
  getCustomModelsByProvider,
  saveChatModelForProvider,
} from '@/lib/ai';
import { openAIProviderSettings } from '@/lib/ai/open-provider-settings';
import { isLocalOpenAICompatProvider, PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED, isProviderWithBrandLogo } from '@/lib/ai/provider-options';
import {
  filterModelsByVisibleIds,
  getDefaultVisibleModelIds,
  getVisibleModelIds,
  isVisibleModelsConfigurable,
} from '@/lib/ai/visible-models';
import type { ModelInputType } from '@/lib/ai/types';
import ProviderBrandIcon from '@/components/settings/ai/ProviderBrandIcon';

type ModelOption = { id: string; label: string };

const DYNAMIC_FETCH_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'opencode',
  'opencode-go',
  'dome',
  'vllm',
  'lmstudio',
];

const CATALOG_PROVIDERS: AIProviderType[] = ['opencode', 'opencode-go'];

function normalizeProvider(p: string): AIProviderType {
  if (p === 'local') return 'ollama';
  return p as AIProviderType;
}

function resolveConfiguredProvider(rawProvider: unknown): AIProviderType {
  let p = normalizeProvider(String(rawProvider));
  if (p === 'dome' && !DOME_PROVIDER_ENABLED) {
    p = 'openai';
  }
  return p;
}

async function loadOllamaModelIds(provider: AIProviderType): Promise<string[]> {
  if (provider !== 'ollama' || !window.electron?.ollama?.listModels) {
    return [];
  }
  try {
    const res = await window.electron.ollama.listModels();
    if (res?.success && Array.isArray(res.models)) {
      return res.models.map((m: { name: string }) => m.name).filter(Boolean);
    }
  } catch {
    // ignore: fall back to empty list
  }
  return [];
}

function canFetchDynamicModels(provider: AIProviderType, apiKey: string | undefined): boolean {
  if (!DYNAMIC_FETCH_PROVIDERS.includes(provider)) return false;
  if (CATALOG_PROVIDERS.includes(provider)) return true;
  // Dome no usa API key: el main consulta el plan del usuario vía OAuth.
  if (provider === 'dome') return true;
  if (isLocalOpenAICompatProvider(provider)) return true;
  return Boolean(apiKey);
}

async function loadDynamicModelOptions(
  provider: AIProviderType,
  apiKey: string | undefined,
): Promise<ModelOption[]> {
  if (!canFetchDynamicModels(provider, apiKey)) return [];

  try {
    const res = await fetchProviderModels(provider, apiKey);
    if (!res?.success || !Array.isArray(res.models)) return [];
    return res.models.map((m: { id: string; name: string }) => ({ id: m.id, label: m.name }));
  } catch {
    // ignore: fall back to empty list
    return [];
  }
}

function modelIdFromConfig(
  provider: AIProviderType,
  cfg: { ollamaModel?: string | null; model?: string | null },
): string {
  if (provider === 'ollama') return cfg.ollamaModel ?? '';
  return cfg.model ?? '';
}

function pushUniqueModelOption(
  out: ModelOption[],
  seen: Set<string>,
  id: string,
  label?: string,
): void {
  if (!id || seen.has(id)) return;
  seen.add(id);
  out.push({ id, label: label ?? id });
}

type BuildModelOptionsInput = {
  provider: AIProviderType;
  catalog: ModelOption[];
  customIds: string[];
  ollamaIds: string[];
  dynamicOpts: ModelOption[];
  currentModelId: string;
  visibleIds: string[];
};

function collectRawModelOptions(input: BuildModelOptionsInput): ModelOption[] {
  const { provider, catalog, customIds, ollamaIds, dynamicOpts, currentModelId } = input;
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const c of catalog) pushUniqueModelOption(out, seen, c.id, c.label);
  for (const c of customIds) pushUniqueModelOption(out, seen, c, c);
  if (provider === 'ollama') {
    for (const o of ollamaIds) pushUniqueModelOption(out, seen, o, o);
  }
  if (DYNAMIC_FETCH_PROVIDERS.includes(provider)) {
    for (const o of dynamicOpts) pushUniqueModelOption(out, seen, o.id, o.label);
  }
  if (currentModelId) pushUniqueModelOption(out, seen, currentModelId, currentModelId);
  return out;
}

function filterOptionsByVisibility(
  provider: AIProviderType,
  options: ModelOption[],
  visibleIds: string[],
): ModelOption[] {
  // Dome: la lista ya viene filtrada por plan desde el provider; el filtro
  // local de "modelos visibles" no aplica (el default sería solo dome/auto).
  if (provider === 'dome') return options;

  const defs = options.map((o) => ({
    id: o.id,
    name: o.label,
    reasoning: false,
    input: ['text'] as ModelInputType[],
    contextWindow: 0,
    maxTokens: 0,
  }));
  const ids = visibleIds.length > 0 ? visibleIds : getDefaultVisibleModelIds(provider);
  const filtered = filterModelsByVisibleIds(defs, ids);
  const allowed = new Set(filtered.map((m) => m.id));
  return options.filter((o) => allowed.has(o.id));
}

function buildModelOptions(input: BuildModelOptionsInput): ModelOption[] {
  return filterOptionsByVisibility(input.provider, collectRawModelOptions(input), input.visibleIds);
}

function catalogOptionsForProvider(provider: AIProviderType | null): ModelOption[] {
  if (!provider) return [];
  const defs = PROVIDERS[provider]?.models ?? [];
  return defs.map((m) => ({ id: m.id, label: m.name }));
}

function isSwitcherVisible(
  enabled: boolean,
  provider: AIProviderType | null,
  catalogLength: number,
  dynamicOptsLength: number,
): boolean {
  if (!enabled || !provider) return false;
  if (provider === 'dome') {
    // Mostrar el selector en cuanto el plan ofrezca más modelos que dome/auto.
    return catalogLength > 1 || dynamicOptsLength > 0;
  }
  return true;
}

function resolveSelectedLabel(
  options: ModelOption[],
  currentModelId: string,
  fallback: string,
): string {
  const hit = options.find((o) => o.id === currentModelId);
  return hit?.label ?? currentModelId ?? fallback;
}

interface InlineModelSwitcherProps {
  /** When false, nothing is rendered. */
  enabled?: boolean;
  /** Dropdown opens above (composer) or below (header) the trigger. */
  dropDirection?: 'above' | 'below';
}

/**
 * Compact model dropdown next to the chat composer. Updates global AI model settings.
 */
export function InlineModelSwitcher({ enabled = true, dropDirection = 'above' }: InlineModelSwitcherProps) {
  const { t } = useTranslation();
  const [configProvider, setConfigProvider] = useState<AIProviderType | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [customMap, setCustomMap] = useState<Partial<Record<AIProviderType, string[]>>>({});
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [ollamaIds, setOllamaIds] = useState<string[]>([]);
  const [dynamicOpts, setDynamicOpts] = useState<ModelOption[]>([]);

  const refresh = useCallback(async () => {
    const cfg = await getAIConfig();
    if (!cfg) {
      setConfigProvider(null);
      return;
    }
    const p = resolveConfiguredProvider(cfg.provider);
    setConfigProvider(p);
    setCurrentModelId(modelIdFromConfig(p, cfg));
    setCustomMap(await getCustomModelsByProvider());
    setVisibleIds(await getVisibleModelIds(p));
    setOllamaIds(await loadOllamaModelIds(p));
    setDynamicOpts(await loadDynamicModelOptions(p, cfg.apiKey?.trim()));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onCfg = () => { void refresh(); };
    window.addEventListener('dome:ai-config-changed', onCfg);
    window.addEventListener('dome:ai-visible-models-changed', onCfg);
    return () => {
      window.removeEventListener('dome:ai-config-changed', onCfg);
      window.removeEventListener('dome:ai-visible-models-changed', onCfg);
    };
  }, [refresh]);

  const provider = configProvider;
  const catalog: ModelOption[] = useMemo(() => catalogOptionsForProvider(provider), [provider]);

  const options: ModelOption[] = useMemo(() => {
    if (!provider) return [];
    return buildModelOptions({
      provider,
      catalog,
      customIds: customMap[provider] ?? [],
      ollamaIds,
      dynamicOpts,
      currentModelId,
      visibleIds,
    });
  }, [provider, catalog, customMap, ollamaIds, dynamicOpts, currentModelId, visibleIds]);

  const allowProviderSettings = provider != null && provider !== 'dome';
  const visible = useMemo(
    () => isSwitcherVisible(enabled, provider, catalog.length, dynamicOpts.length),
    [enabled, provider, catalog.length, dynamicOpts.length],
  );

  const selectedLabel = useMemo(
    () => resolveSelectedLabel(options, currentModelId, t('chat.model_switcher_title')),
    [options, currentModelId, t],
  );

  const pickModel = useCallback(
    async (id: string) => {
      if (!provider) return;
      await saveChatModelForProvider(provider, id);
      setCurrentModelId(id);
      window.dispatchEvent(new Event('dome:ai-config-changed'));
    },
    [provider],
  );

  const goToProviderSettings = useCallback(() => {
    if (!provider) return;
    openAIProviderSettings({
      provider,
      openModelsModal: isVisibleModelsConfigurable(provider),
    });
  }, [provider]);

  if (!visible) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-w-[min(180px,100%)] min-w-0 shrink rounded-full"
            title={t('chat.model_switcher_title')}
          >
            {provider && isProviderWithBrandLogo(provider) ? (
              <ProviderBrandIcon provider={provider} size={14} className="!p-0 shrink-0" />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
            <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent
        side={dropDirection === 'below' ? 'bottom' : 'top'}
        align="start"
        className="max-h-56 w-auto min-w-[200px] max-w-80 overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={currentModelId}
          onValueChange={(id) => {
            void pickModel(String(id)).catch(() => {});
          }}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} className="text-xs">
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {allowProviderSettings ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-primary" onClick={goToProviderSettings}>
              <HugeiconsIcon icon={Settings01Icon} aria-hidden />
              {t('chat.open_provider_settings')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
