import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchProviderModels,
  getAIConfig,
  getCustomModelsByProvider,
  saveChatModelForProvider,
} from '@/lib/ai';
import { openAIProviderSettings } from '@/lib/ai/open-provider-settings';
import type { AIProviderType } from '@/lib/ai/models';
import { PROVIDERS } from '@/lib/ai/models';
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
];

const CATALOG_PROVIDERS: AIProviderType[] = ['opencode', 'opencode-go'];

function normalizeProvider(p: string): AIProviderType {
  if (p === 'local') return 'ollama';
  return p as AIProviderType;
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
  const [open, setOpen] = useState(false);
  const [configProvider, setConfigProvider] = useState<AIProviderType | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [customMap, setCustomMap] = useState<Partial<Record<AIProviderType, string[]>>>({});
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [ollamaIds, setOllamaIds] = useState<string[]>([]);
  const [dynamicOpts, setDynamicOpts] = useState<ModelOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const portalDropdownRef = useRef<HTMLUListElement>(null);
  const [portalAnchor, setPortalAnchor] = useState<DOMRect | null>(null);

  const refresh = useCallback(async () => {
    const cfg = await getAIConfig();
    if (!cfg) {
      setConfigProvider(null);
      return;
    }
    let p = normalizeProvider(String(cfg.provider));
    if (p === 'dome' && !DOME_PROVIDER_ENABLED) {
      p = 'openai';
    }
    setConfigProvider(p);
    const mid = p === 'ollama' ? (cfg.ollamaModel ?? '') : (cfg.model ?? '');
    setCurrentModelId(mid);
    const cm = await getCustomModelsByProvider();
    setCustomMap(cm);
    const visible = await getVisibleModelIds(p);
    setVisibleIds(visible);
    if (p === 'ollama' && window.electron?.ollama?.listModels) {
      try {
        const res = await window.electron.ollama.listModels();
        if (res?.success && Array.isArray(res.models)) {
          setOllamaIds(res.models.map((m: { name: string }) => m.name).filter(Boolean));
        } else {
          setOllamaIds([]);
        }
      } catch {
        setOllamaIds([]);
      }
    } else {
      setOllamaIds([]);
    }

    const key = cfg.apiKey?.trim();
    const canFetchModels =
      DYNAMIC_FETCH_PROVIDERS.includes(p) && (CATALOG_PROVIDERS.includes(p) || Boolean(key));
    if (canFetchModels) {
      try {
        const res = await fetchProviderModels(p, key);
        if (res?.success && Array.isArray(res.models)) {
          setDynamicOpts(res.models.map((m: { id: string; name: string }) => ({ id: m.id, label: m.name })));
        } else {
          setDynamicOpts([]);
        }
      } catch {
        setDynamicOpts([]);
      }
    } else {
      setDynamicOpts([]);
    }
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

  useLayoutEffect(() => {
    if (!open || !containerRef.current) {
      setPortalAnchor(null);
      return;
    }
    const update = () => {
      if (containerRef.current) {
        setPortalAnchor(containerRef.current.getBoundingClientRect());
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || portalDropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const provider = configProvider;
  const catalog: ModelOption[] = useMemo(() => {
    if (!provider) return [];
    const defs = PROVIDERS[provider]?.models ?? [];
    return defs.map((m) => ({ id: m.id, label: m.name }));
  }, [provider]);

  const options: ModelOption[] = useMemo(() => {
    if (!provider) return [];
    const customIds = customMap[provider] ?? [];
    const seen = new Set<string>();
    const out: ModelOption[] = [];
    const push = (id: string, label?: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, label: label ?? id });
    };
    for (const c of catalog) push(c.id, c.label);
    for (const c of customIds) push(c, c);
    if (provider === 'ollama') {
      for (const o of ollamaIds) push(o, o);
    }
    if (DYNAMIC_FETCH_PROVIDERS.includes(provider)) {
      for (const o of dynamicOpts) push(o.id, o.label);
    }
    if (currentModelId) push(currentModelId, currentModelId);

    const defs = out.map((o) => ({
      id: o.id,
      name: o.label,
      reasoning: false,
      input: ['text'] as ModelInputType[],
      contextWindow: 0,
      maxTokens: 0,
    }));
    const filtered = filterModelsByVisibleIds(defs, visibleIds.length ? visibleIds : getDefaultVisibleModelIds(provider));
    const allowed = new Set(filtered.map((m) => m.id));
    return out.filter((o) => allowed.has(o.id));
  }, [provider, catalog, customMap, ollamaIds, dynamicOpts, currentModelId, visibleIds]);

  const allowProviderSettings = provider != null && provider !== 'dome';
  const visible = useMemo(() => {
    if (!enabled || !provider) return false;
    if (provider === 'dome') {
      return catalog.length > 1;
    }
    return true;
  }, [enabled, provider, catalog.length]);

  const selectedLabel = useMemo(() => {
    const hit = options.find((o) => o.id === currentModelId);
    return hit?.label ?? currentModelId ?? t('chat.model_switcher_title');
  }, [options, currentModelId, t]);

  const pickModel = useCallback(
    async (id: string) => {
      if (!provider) return;
      await saveChatModelForProvider(provider, id);
      setCurrentModelId(id);
      window.dispatchEvent(new Event('dome:ai-config-changed'));
      setOpen(false);
    },
    [provider],
  );

  const goToProviderSettings = useCallback(() => {
    if (!provider) return;
    setOpen(false);
    openAIProviderSettings({
      provider,
      openModelsModal: isVisibleModelsConfigurable(provider),
    });
  }, [provider]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[min(180px,100%)] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] px-2.5 py-1 text-left text-[11px] font-medium text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
        title={t('chat.model_switcher_title')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {provider && isProviderWithBrandLogo(provider) ? (
          <ProviderBrandIcon provider={provider} size={14} className="!p-0 shrink-0" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
      {open && portalAnchor && typeof document !== 'undefined'
        ? createPortal(
            <ul
              ref={portalDropdownRef}
              role="listbox"
              className="fixed z-[var(--z-popover)] max-h-56 min-w-[200px] list-none m-0 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-0 py-1 shadow-lg"
              style={
                dropDirection === 'below'
                  ? {
                      left: Math.min(portalAnchor.left, window.innerWidth - 320 - 8),
                      top: portalAnchor.bottom + 8,
                      minWidth: Math.max(200, portalAnchor.width),
                      maxWidth: Math.min(320, window.innerWidth - 16),
                    }
                  : {
                      right: window.innerWidth - portalAnchor.right,
                      bottom: window.innerHeight - portalAnchor.top + 8,
                      minWidth: Math.max(200, portalAnchor.width),
                      maxWidth: Math.min(320, window.innerWidth - 16),
                    }
              }
            >
              {options.map((o) => {
                const sel = o.id === currentModelId;
                return (
                  <li key={o.id} className="list-none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={sel}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--primary-text)' }}
                    onClick={() => void pickModel(o.id)}
                  >
                    {sel ? <Check className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden /> : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                  </li>
                );
              })}
              {allowProviderSettings ? (
                <li className="list-none border-t border-[var(--border)] p-2">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                    onClick={goToProviderSettings}
                  >
                    <Settings2 className="size-3.5 shrink-0" aria-hidden />
                    <span>{t('chat.open_provider_settings')}</span>
                  </button>
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
