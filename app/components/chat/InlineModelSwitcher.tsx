import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getAIConfig,
  saveChatModelForProvider,
  getCustomModelsByProvider,
  appendCustomModelId,
} from '@/lib/ai';
import type { AIProviderType } from '@/lib/ai/models';
import { PROVIDERS } from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';

type ModelOption = { id: string; label: string };

function normalizeProvider(p: string): AIProviderType {
  if (p === 'local') return 'ollama';
  return p as AIProviderType;
}

interface InlineModelSwitcherProps {
  /** When false, nothing is rendered. */
  enabled?: boolean;
}

/**
 * Compact model dropdown next to the chat composer. Updates global AI model settings.
 */
export function InlineModelSwitcher({ enabled = true }: InlineModelSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [configProvider, setConfigProvider] = useState<AIProviderType | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [customMap, setCustomMap] = useState<Partial<Record<AIProviderType, string[]>>>({});
  const [ollamaIds, setOllamaIds] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const portalDropdownRef = useRef<HTMLDivElement>(null);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onCfg = () => { void refresh(); };
    window.addEventListener('dome:ai-config-changed', onCfg);
    return () => window.removeEventListener('dome:ai-config-changed', onCfg);
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
      setAddingCustom(false);
      setCustomDraft('');
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
    if (currentModelId) push(currentModelId, currentModelId);
    return out;
  }, [provider, catalog, customMap, ollamaIds, currentModelId]);

  const allowCustom = provider != null && provider !== 'dome';
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
      setAddingCustom(false);
    },
    [provider],
  );

  const submitCustom = useCallback(async () => {
    const id = customDraft.trim();
    if (!id || !provider) return;
    await appendCustomModelId(provider, id);
    setCustomMap((prev) => ({
      ...prev,
      [provider]: [...(prev[provider] ?? []).filter((x) => x !== id), id],
    }));
    await pickModel(id);
    setCustomDraft('');
    setAddingCustom(false);
  }, [customDraft, provider, pickModel]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[min(140px,100%)] items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] px-2.5 py-1 text-left text-[11px] font-medium text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
        title={t('chat.model_switcher_title')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
      {open && portalAnchor && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={portalDropdownRef}
              role="listbox"
              className="fixed z-[var(--z-popover)] max-h-56 min-w-[200px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg"
              style={{
                right: window.innerWidth - portalAnchor.right,
                bottom: window.innerHeight - portalAnchor.top + 8,
                minWidth: Math.max(200, portalAnchor.width),
                maxWidth: Math.min(320, window.innerWidth - 16),
              }}
            >
              {options.map((o) => {
                const sel = o.id === currentModelId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--primary-text)' }}
                    onClick={() => void pickModel(o.id)}
                  >
                    {sel ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden /> : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                );
              })}
              {allowCustom ? (
                <div className="border-t border-[var(--border)] px-2 py-2">
                  {addingCustom ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={customDraft}
                        onChange={(e) => setCustomDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void submitCustom();
                          }
                        }}
                        placeholder={t('chat.custom_model_placeholder')}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[11px] text-[var(--primary-text)]"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="rounded-md bg-[var(--bg-tertiary)] px-2 py-1 text-[11px] font-medium text-[var(--primary-text)] hover:bg-[var(--bg-hover)]"
                        onClick={() => void submitCustom()}
                      >
                        {t('common.add')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                      onClick={() => setAddingCustom(true)}
                    >
                      {t('chat.add_custom_model')}
                    </button>
                  )}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
