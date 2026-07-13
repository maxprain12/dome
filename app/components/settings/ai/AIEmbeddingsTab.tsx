import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Layers } from 'lucide-react';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import {
  EMBEDDINGS_PROVIDER_IDS,
  PROVIDERS,
  getEmbeddingModelsForProvider,
  getRecommendedEmbeddingModel,
  type EmbeddingsProviderType,
  type ModelDefinition,
} from '@/lib/ai/models';
import ModelSelector from '../ModelSelector';
import ProviderBrandIcon from './ProviderBrandIcon';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import { DomeInput } from '@/components/ui/DomeInput';
import { cn } from '@/lib/utils';

interface EmbeddingsDiscoveredModel {
  id: string;
  name: string;
  dimensions?: number;
  recommended?: boolean;
}

interface EmbeddingsSelectorSource {
  source: 'remote' | 'static';
  models?: EmbeddingsDiscoveredModel[];
}

interface EmbeddingsTestResult {
  success: boolean;
  message: string;
}

interface EmbeddingsStatus {
  configured?: boolean;
  modelVersion?: string | null;
  dimensions?: number | null;
  chunksTotal?: number;
  indexedResourceCount?: number;
}

function embeddingModelsAsSelector(
  provider: EmbeddingsProviderType,
  discovered?: EmbeddingsDiscoveredModel[],
): ModelDefinition[] {
  const source =
    discovered && discovered.length > 0
      ? discovered
      : getEmbeddingModelsForProvider(provider);
  return source.map((m) => ({
    id: m.id,
    name: m.name,
    reasoning: false,
    input: ['text'],
    contextWindow: m.dimensions ?? 0,
    maxTokens: 0,
    description: m.dimensions ? `${m.dimensions} dims` : undefined,
    recommended: m.recommended,
  }));
}

function EmbeddingsProviderCheck({ selected }: { selected: boolean }) {
  return (
    <CheckCircle2
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-2 right-2 size-3.5 shrink-0 transition-opacity duration-150',
        selected ? 'opacity-100' : 'opacity-0',
      )}
      style={{ color: 'var(--dome-accent)' }}
    />
  );
}

async function discoverEmbeddingsModels(
  provider: EmbeddingsProviderType,
  apiKey: string,
  baseUrl: string,
): Promise<EmbeddingsSelectorSource> {
  if (!window.electron?.embeddings?.listModels) return { source: 'static' };
  try {
    const r = await window.electron.embeddings.listModels({
      provider,
      api_key: provider === 'ollama' ? undefined : apiKey,
      base_url: provider === 'ollama' ? baseUrl : undefined,
    });
    if (r.success && r.data?.models?.length) {
      return { source: r.data.source, models: r.data.models };
    }
    return { source: 'static' };
  } catch {
    return { source: 'static' };
  }
}

function pickPreferredModelId(
  mapped: ModelDefinition[],
  currentId: string,
): string {
  if (mapped.some((m) => m.id === currentId)) return currentId;
  const rec = mapped.find((m) => m.recommended) ?? mapped[0];
  return rec?.id ?? currentId;
}

async function runEmbeddingsTest(
  args: {
    provider: EmbeddingsProviderType;
    model: string;
    apiKey: string;
    baseUrl: string;
  },
  t: TFunction,
): Promise<EmbeddingsTestResult> {
  if (!window.electron?.embeddings?.test) {
    return { success: false, message: t('settings.ai.embeddings.test_unavailable') };
  }
  const r = await window.electron.embeddings.test({
    provider: args.provider,
    model: args.model,
    api_key: args.apiKey,
    base_url: args.baseUrl,
  });
  if (r.success && r.data?.ok) {
    return {
      success: true,
      message: t('settings.ai.embeddings.test_ok', {
        dimensions: String(r.data.dimensions ?? '?'),
        ms: String(r.data.latencyMs ?? '?'),
      }),
    };
  }
  return {
    success: false,
    message: r.error || t('settings.ai.embeddings.test_failed'),
  };
}

function buildEmbeddingsSaveKey(
  provider: EmbeddingsProviderType,
  model: string,
  apiKey: string,
  baseUrl: string,
): string {
  return `${provider}|${model}|${apiKey}|${baseUrl}`;
}

function buildEmbeddingsSaveConfig(
  provider: EmbeddingsProviderType,
  model: string,
  apiKey: string,
  baseUrl: string,
): Parameters<typeof saveAIConfig>[0] {
  return {
    embeddings_provider: provider,
    embeddings_api_key: provider === 'ollama' ? '' : apiKey,
    embeddings_model: model,
    embeddings_base_url: provider === 'ollama' ? baseUrl : '',
  };
}

function confirmEmbeddingsReindex(changed: boolean, t: TFunction): boolean {
  if (!changed) return true;
  return window.confirm(t('settings.ai.embeddings.reindex_warning'));
}

function describeTestError(e: unknown, t: TFunction): string {
  return e instanceof Error ? e.message : t('settings.ai.embeddings.test_failed');
}

function getEmbeddingsReloadDelay(provider: EmbeddingsProviderType): number {
  return provider === 'ollama' ? 0 : 400;
}

function clearDebounceRef(ref: { current: ReturnType<typeof setTimeout> | null }) {
  if (ref.current) clearTimeout(ref.current);
}

async function fetchEmbeddingsStatus(): Promise<EmbeddingsStatus | null> {
  if (!window.electron?.embeddings?.getStatus) return null;
  try {
    const r = await window.electron.embeddings.getStatus();
    if (r.success && r.data) return r.data;
    return null;
  } catch {
    return null;
  }
}

function applyProviderDefaults(
  p: EmbeddingsProviderType,
  setModel: (m: string) => void,
  setBaseUrl: (b: string) => void,
) {
  const rec = getRecommendedEmbeddingModel(p);
  if (rec) setModel(rec.id);
  if (p === 'ollama') setBaseUrl('http://localhost:11434');
}

async function persistEmbeddingsConfig(args: {
  provider: EmbeddingsProviderType;
  model: string;
  apiKey: string;
  baseUrl: string;
  nextKey: string;
  changed: boolean;
  initialKeyRef: { current: string };
  setSaved: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  loadStatus: () => Promise<void>;
}): Promise<void> {
  args.setSaving(true);
  try {
    await saveAIConfig(buildEmbeddingsSaveConfig(args.provider, args.model, args.apiKey, args.baseUrl));
    args.initialKeyRef.current = args.nextKey;
    args.setSaved(true);
    setTimeout(() => args.setSaved(false), 3000);
    if (args.changed && window.electron?.embeddings?.apply) {
      void window.electron.embeddings.apply();
    }
    await args.loadStatus();
  } catch (e) {
    console.error('[AIEmbeddingsTab] save', e);
  } finally {
    args.setSaving(false);
  }
}

function EmbeddingsHeader() {
  const { t } = useTranslation();
  return (
    <p className="text-sm leading-relaxed text-[var(--dome-text-muted)]">
      {t('settings.ai.embeddings.description')}
    </p>
  );
}

function EmbeddingsProviderPicker({
  provider,
  onChange,
}: {
  provider: EmbeddingsProviderType;
  onChange: (p: EmbeddingsProviderType) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="ai-settings__section-label mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>{t('settings.ai.embeddings.provider')}</span>
        <span className="text-[11px] font-normal normal-case tracking-normal opacity-80">
          {t('settings.ai.active_provider')}:{' '}
          <span className="font-medium text-[var(--dome-text)]">{PROVIDERS[provider].name}</span>
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t('settings.ai.embeddings.provider')}
        className="ai-provider-picker__grid settings-choice-grid settings-choice-grid--3 gap-2"
      >
        {EMBEDDINGS_PROVIDER_IDS.map((id) => {
          const def = PROVIDERS[id];
          const active = provider === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(id)}
              className={cn(
                'ai-provider-picker__card settings-provider-card relative flex w-full min-w-0 flex-col items-start p-2.5 pr-7 rounded-xl text-left transition-all',
                active
                  ? 'border border-[var(--dome-accent)] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                  : 'border border-[var(--dome-border)] bg-[var(--dome-surface)] hover:border-[var(--dome-border-hover,var(--dome-border))]',
              )}
            >
              <EmbeddingsProviderCheck selected={active} />
              <ProviderBrandIcon provider={id} size={20} />
              <span className="settings-provider-card__title mt-1.5 w-full min-w-0 truncate text-xs font-semibold text-[var(--dome-text)]">
                {def.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmbeddingsApiKeyField({
  provider,
  apiKey,
  setApiKey,
  showApiKey,
  setShowApiKey,
  hasApiKey,
}: {
  provider: EmbeddingsProviderType;
  apiKey: string;
  setApiKey: (v: string) => void;
  showApiKey: boolean;
  setShowApiKey: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasApiKey: boolean;
}) {
  const { t } = useTranslation();
  const providerDef = PROVIDERS[provider];
  return (
    <div>
      <label
        htmlFor="embeddings-api-key"
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--dome-text)]"
      >
        {t('settings.ai.embeddings.api_key')}
        {hasApiKey ? (
          <KeyRound className="size-3 text-[var(--success)]" aria-label={t('settings.ai.provider_status_configured')} />
        ) : null}
      </label>
      <div className="relative w-full">
        <DomeInput
          id="embeddings-api-key"
          type={showApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={providerDef?.apiKeyPlaceholder || ''}
          inputClassName="pr-10"
          className="w-full [&_input]:pr-10"
        />
        <DomeButton
          type="button"
          variant="ghost"
          size="xs"
          iconOnly
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setShowApiKey((v) => !v)}
          aria-label={showApiKey ? 'Hide' : 'Show'}
        >
          {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </DomeButton>
      </div>
      {providerDef?.docsUrl ? (
        <p className="text-[11px] mt-1.5 text-[var(--dome-text-muted)]">
          {t('settings.ai.free_key_at')}{' '}
          <a href={providerDef.docsUrl} target="_blank" rel="noreferrer" className="underline">
            {providerDef.docsUrl}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function EmbeddingsBaseUrlField({
  baseUrl,
  setBaseUrl,
}: {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor="embeddings-base-url" className="block text-sm font-medium mb-1.5 text-[var(--dome-text)]">
        {t('settings.ai.embeddings.base_url')}
      </label>
      <DomeInput
        id="embeddings-base-url"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="http://localhost:11434"
      />
      <p className="text-[11px] mt-1.5 text-[var(--dome-text-muted)]">{t('settings.ai.ollama_install')}</p>
    </div>
  );
}

function EmbeddingsModelSection({
  selectorModels,
  model,
  onChange,
  modelsLoading,
  modelsSource,
}: {
  selectorModels: ModelDefinition[];
  model: string;
  onChange: (m: string) => void;
  modelsLoading: boolean;
  modelsSource: 'remote' | 'static' | null;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--dome-text)]">
        {t('settings.ai.embeddings.model')}
        {modelsLoading ? <Loader2 className="size-3 animate-spin opacity-60" aria-hidden /> : null}
      </label>
      <ModelSelector
        models={selectorModels}
        selectedModelId={model}
        onChange={onChange}
        showContextWindow={false}
        showDescription
        placeholder={t('settings.ai.embeddings.model')}
        disabled={modelsLoading}
      />
      {modelsSource === 'remote' ? (
        <p className="text-[11px] mt-1.5 text-[var(--dome-text-muted)]">
          {t('settings.ai.embeddings.models_discovered')}
        </p>
      ) : null}
    </div>
  );
}

function EmbeddingsActionButtons({
  testing,
  saving,
  saved,
  onTest,
  onSave,
}: {
  testing: boolean;
  saving: boolean;
  saved: boolean;
  onTest: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <DomeButton
        type="button"
        variant="outline"
        size="md"
        disabled={testing || saving}
        onClick={() => void onTest()}
        leftIcon={testing ? <Loader2 className="size-4 animate-spin" /> : undefined}
      >
        {testing ? t('settings.ai.testing') : t('settings.ai.embeddings.test')}
      </DomeButton>
      <DomeButton
        type="button"
        variant="primary"
        size="md"
        disabled={saving}
        onClick={() => void onSave()}
        leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
      >
        {saved ? t('settings.ai.saved_config') : t('settings.ai.embeddings.save')}
      </DomeButton>
    </div>
  );
}

function EmbeddingsStatusCard({ status }: { status: EmbeddingsStatus | null }) {
  const { t } = useTranslation();
  return (
    <DomeCard className="space-y-2">
      <p className="text-sm font-medium text-[var(--dome-text)]">{t('settings.ai.embeddings.status_title')}</p>
      {!status?.configured ? (
        <p className="text-sm text-[var(--dome-text-muted)]">{t('settings.ai.embeddings.status.not_configured')}</p>
      ) : (
        <ul className="text-sm space-y-1 text-[var(--dome-text)]">
          {status.modelVersion ? (
            <li>
              {t('settings.ai.embeddings.status.model_active')}:{' '}
              <span className="font-mono text-xs">{status.modelVersion}</span>
            </li>
          ) : null}
          {status.dimensions != null ? (
            <li>
              {t('settings.ai.embeddings.status.dimensions')}: {status.dimensions}
            </li>
          ) : null}
          <li>
            {t('settings.embeddings.chunks')}: {status.chunksTotal ?? 0} · {t('settings.embeddings.indexed')}:{' '}
            {status.indexedResourceCount ?? 0}
          </li>
        </ul>
      )}
    </DomeCard>
  );
}

export default function AIEmbeddingsTab() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<EmbeddingsProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('text-embedding-3-small');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EmbeddingsTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<EmbeddingsStatus | null>(null);
  const initialKeyRef = useRef('');
  const [selectorModels, setSelectorModels] = useState<ModelDefinition[]>(() =>
    embeddingModelsAsSelector('openai'),
  );
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsSource, setModelsSource] = useState<'remote' | 'static' | null>(null);
  const apiKeyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDiscoveredModels = useCallback(async () => {
    setModelsLoading(true);
    const result = await discoverEmbeddingsModels(provider, apiKey, baseUrl);
    const mapped = embeddingModelsAsSelector(provider, result.models);
    setSelectorModels(mapped);
    setModelsSource(result.source);
    if (result.source === 'remote') {
      setModel((current) => pickPreferredModelId(mapped, current));
    }
    setModelsLoading(false);
  }, [provider, apiKey, baseUrl]);

  const loadConfig = useCallback(async () => {
    const config = await getAIConfig();
    const p = (config.embeddings_provider as EmbeddingsProviderType) || 'openai';
    const safeProvider = EMBEDDINGS_PROVIDER_IDS.includes(p) ? p : 'openai';
    setProvider(safeProvider);
    setApiKey(config.embeddings_api_key || '');
    const rec = getRecommendedEmbeddingModel(safeProvider);
    setModel(config.embeddings_model || rec?.id || 'text-embedding-3-small');
    setBaseUrl(config.embeddings_base_url || 'http://localhost:11434');
    initialKeyRef.current =
      `${safeProvider}|${config.embeddings_model || ''}|${config.embeddings_api_key || ''}|${config.embeddings_base_url || ''}`;
  }, []);

  const loadStatus = useCallback(async () => {
    const nextStatus = await fetchEmbeddingsStatus();
    if (nextStatus) setStatus(nextStatus);
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadStatus();
  }, [loadConfig, loadStatus]);

  useEffect(() => {
    clearDebounceRef(apiKeyDebounceRef);
    apiKeyDebounceRef.current = setTimeout(() => {
      void loadDiscoveredModels();
    }, getEmbeddingsReloadDelay(provider));
    return () => {
      clearDebounceRef(apiKeyDebounceRef);
    };
  }, [loadDiscoveredModels, provider, baseUrl, apiKey]);

  const handleProviderChange = (p: EmbeddingsProviderType) => {
    setProvider(p);
    applyProviderDefaults(p, setModel, setBaseUrl);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await runEmbeddingsTest({ provider, model, apiKey, baseUrl }, t);
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: describeTestError(e, t) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const nextKey = buildEmbeddingsSaveKey(provider, model, apiKey, baseUrl);
    const changed = nextKey !== initialKeyRef.current;
    if (!confirmEmbeddingsReindex(changed, t)) return;
    await persistEmbeddingsConfig({
      provider,
      model,
      apiKey,
      baseUrl,
      nextKey,
      changed,
      initialKeyRef,
      setSaved,
      setSaving,
      loadStatus,
    });
  };

  const hasApiKey = provider !== 'ollama' && apiKey.trim().length > 0;

  return (
    <div className="min-w-0 w-full space-y-4">
      <EmbeddingsHeader />
      <EmbeddingsProviderPicker provider={provider} onChange={handleProviderChange} />
      <DomeCard className="space-y-4">
        {provider !== 'ollama' ? (
          <EmbeddingsApiKeyField
            provider={provider}
            apiKey={apiKey}
            setApiKey={setApiKey}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
            hasApiKey={hasApiKey}
          />
        ) : (
          <EmbeddingsBaseUrlField baseUrl={baseUrl} setBaseUrl={setBaseUrl} />
        )}
        <EmbeddingsModelSection
          selectorModels={selectorModels}
          model={model}
          onChange={setModel}
          modelsLoading={modelsLoading}
          modelsSource={modelsSource}
        />
        <EmbeddingsActionButtons
          testing={testing}
          saving={saving}
          saved={saved}
          onTest={handleTest}
          onSave={handleSave}
        />
        {testResult ? (
          <DomeCallout tone={testResult.success ? 'success' : 'error'}>{testResult.message}</DomeCallout>
        ) : null}
      </DomeCard>
      <EmbeddingsStatusCard status={status} />
    </div>
  );
}
