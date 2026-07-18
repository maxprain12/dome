import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
  EyeOffIcon,
  Key01Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SettingsGroup, SettingsRow } from '../blocks';
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
import { showToast } from '@/lib/store/useToastStore';

function embeddingModelsAsSelector(
  provider: EmbeddingsProviderType,
  discovered?: Array<{
    id: string;
    name: string;
    dimensions?: number;
    recommended?: boolean;
  }>,
): ModelDefinition[] {
  const source =
    discovered && discovered.length > 0 ? discovered : getEmbeddingModelsForProvider(provider);
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

/** Embeddings pipeline config: provider, credentials, model and index status. */
export default function AIEmbeddingsTab() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<EmbeddingsProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('text-embedding-3-small');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReindex, setConfirmReindex] = useState(false);
  const [status, setStatus] = useState<{
    configured?: boolean;
    modelVersion?: string | null;
    dimensions?: number | null;
    chunksTotal?: number;
    indexedResourceCount?: number;
  } | null>(null);
  const initialKeyRef = useRef('');
  const skipConfirmRef = useRef(false);
  const [selectorModels, setSelectorModels] = useState<ModelDefinition[]>(() =>
    embeddingModelsAsSelector('openai'),
  );
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsSource, setModelsSource] = useState<'remote' | 'static' | null>(null);
  const apiKeyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDiscoveredModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      if (window.electron?.embeddings?.listModels) {
        const r = await window.electron.embeddings.listModels({
          provider,
          api_key: provider === 'ollama' ? undefined : apiKey,
          base_url: provider === 'ollama' ? baseUrl : undefined,
        });
        if (r.success && r.data?.models?.length) {
          const mapped = embeddingModelsAsSelector(provider, r.data.models);
          setSelectorModels(mapped);
          setModelsSource(r.data.source);
          setModel((current) => {
            if (mapped.some((m) => m.id === current)) return current;
            const rec = mapped.find((m) => m.recommended) ?? mapped[0];
            return rec?.id ?? current;
          });
          return;
        }
      }
      setSelectorModels(embeddingModelsAsSelector(provider));
      setModelsSource('static');
    } catch {
      setSelectorModels(embeddingModelsAsSelector(provider));
      setModelsSource('static');
    } finally {
      setModelsLoading(false);
    }
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
    initialKeyRef.current = `${safeProvider}|${config.embeddings_model || ''}|${config.embeddings_api_key || ''}|${config.embeddings_base_url || ''}`;
  }, []);

  const loadStatus = useCallback(async () => {
    if (!window.electron?.embeddings?.getStatus) return;
    try {
      const r = await window.electron.embeddings.getStatus();
      if (r.success && r.data) setStatus(r.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadStatus();
  }, [loadConfig, loadStatus]);

  // Debounce model discovery while the user types the API key.
  useEffect(() => {
    if (apiKeyDebounceRef.current) clearTimeout(apiKeyDebounceRef.current);
    const delay = provider === 'ollama' ? 0 : 400;
    apiKeyDebounceRef.current = setTimeout(() => {
      void loadDiscoveredModels();
    }, delay);
    return () => {
      if (apiKeyDebounceRef.current) clearTimeout(apiKeyDebounceRef.current);
    };
  }, [loadDiscoveredModels, provider, baseUrl, apiKey]);

  const handleProviderChange = (p: EmbeddingsProviderType) => {
    setProvider(p);
    const rec = getRecommendedEmbeddingModel(p);
    if (rec) setModel(rec.id);
    if (p === 'ollama') setBaseUrl('http://localhost:11434');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (!window.electron?.embeddings?.test) {
        setTestResult({ success: false, message: t('settings.ai.embeddings.test_unavailable') });
        return;
      }
      const r = await window.electron.embeddings.test({
        provider,
        model,
        api_key: apiKey,
        base_url: baseUrl,
      });
      if (r.success && r.data?.ok) {
        setTestResult({
          success: true,
          message: t('settings.ai.embeddings.test_ok', {
            dimensions: String(r.data.dimensions ?? '?'),
            ms: String(r.data.latencyMs ?? '?'),
          }),
        });
      } else {
        setTestResult({
          success: false,
          message: r.error || t('settings.ai.embeddings.test_failed'),
        });
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : t('settings.ai.embeddings.test_failed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const nextKey = `${provider}|${model}|${apiKey}|${baseUrl}`;
    const changed = nextKey !== initialKeyRef.current;
    if (changed && !skipConfirmRef.current) {
      setConfirmReindex(true);
      return;
    }
    skipConfirmRef.current = false;
    setSaving(true);
    try {
      await saveAIConfig({
        embeddings_provider: provider,
        embeddings_api_key: provider === 'ollama' ? '' : apiKey,
        embeddings_model: model,
        embeddings_base_url: provider === 'ollama' ? baseUrl : '',
      });
      initialKeyRef.current = nextKey;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (changed && window.electron?.embeddings?.apply) {
        void window.electron.embeddings.apply();
      }
      await loadStatus();
    } catch (e) {
      console.error('[AIEmbeddingsTab] save', e);
      showToast('error', e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const hasApiKey = provider !== 'ollama' && apiKey.trim().length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('settings.ai.embeddings.description')}
      </p>

      <SettingsGroup
        title={t('settings.ai.embeddings.provider')}
        actions={
          <span className="text-[11px] text-muted-foreground">
            {t('settings.ai.active_provider')}:{' '}
            <span className="font-medium text-foreground">{PROVIDERS[provider].name}</span>
          </span>
        }
        bare
      >
        <ToggleGroup
          value={[provider]}
          onValueChange={(values) =>
            values[0] && handleProviderChange(values[0] as EmbeddingsProviderType)
          }
          aria-label={t('settings.ai.embeddings.provider')}
          className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {EMBEDDINGS_PROVIDER_IDS.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              variant="outline"
              aria-label={PROVIDERS[id].name}
              className="h-auto w-full flex-col items-start gap-1.5 rounded-xl p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
            >
              <ProviderBrandIcon provider={id} size={20} />
              <span className="w-full min-w-0 truncate text-xs font-semibold">
                {PROVIDERS[id].name}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>

      <SettingsGroup
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || saving}
              onClick={() => void handleTest()}
            >
              {testing ? <Spinner data-icon="inline-start" /> : null}
              {testing ? t('settings.ai.testing') : t('settings.ai.embeddings.test')}
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={Layers01Icon} data-icon="inline-start" />
              )}
              {saved ? t('settings.ai.saved_config') : t('settings.ai.embeddings.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          {provider !== 'ollama' ? (
            <Field>
              <FieldLabel htmlFor="embeddings-api-key" className="flex items-center gap-1.5">
                {t('settings.ai.embeddings.api_key')}
                {hasApiKey ? (
                  <HugeiconsIcon
                    icon={Key01Icon}
                    className="size-3 text-success"
                    aria-label={t('settings.ai.provider_status_configured')}
                  />
                ) : null}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="embeddings-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || ''}
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowApiKey((v) => !v)}
                    aria-label={showApiKey ? 'Hide' : 'Show'}
                  >
                    <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              {PROVIDERS[provider]?.docsUrl ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('settings.ai.free_key_at')}{' '}
                  <a
                    href={PROVIDERS[provider].docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {PROVIDERS[provider].docsUrl}
                  </a>
                </p>
              ) : null}
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="embeddings-base-url">
                {t('settings.ai.embeddings.base_url')}
              </FieldLabel>
              <Input
                id="embeddings-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <p className="text-[11px] text-muted-foreground">{t('settings.ai.ollama_install')}</p>
            </Field>
          )}

          <Field>
            <FieldLabel className="flex items-center gap-2">
              {t('settings.ai.embeddings.model')}
              {modelsLoading ? <Spinner className="opacity-60" /> : null}
            </FieldLabel>
            <ModelSelector
              models={selectorModels}
              selectedModelId={model}
              onChange={setModel}
              showContextWindow={false}
              showDescription
              placeholder={t('settings.ai.embeddings.model')}
              disabled={modelsLoading}
            />
            {modelsSource === 'remote' ? (
              <p className="text-[11px] text-muted-foreground">
                {t('settings.ai.embeddings.models_discovered')}
              </p>
            ) : null}
          </Field>

          {testResult ? (
            <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
              <HugeiconsIcon
                icon={testResult.success ? CheckmarkCircle02Icon : AlertCircleIcon}
                aria-hidden
              />
              <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.ai.embeddings.status_title')}>
        <SettingsRow
          title={t('settings.ai.embeddings.status_title')}
          description={
            !status?.configured ? t('settings.ai.embeddings.status.not_configured') : undefined
          }
        >
          {status?.configured ? (
            <ul className="flex flex-col gap-1 text-sm">
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
                {t('settings.embeddings.chunks')}: {status.chunksTotal ?? 0} ·{' '}
                {t('settings.embeddings.indexed')}: {status.indexedResourceCount ?? 0}
              </li>
            </ul>
          ) : null}
        </SettingsRow>
      </SettingsGroup>

      <ConfirmDialog
        isOpen={confirmReindex}
        title={t('settings.ai.embeddings.reindex_warning')}
        message={t('settings.ai.embeddings.reindex_warning')}
        onConfirm={() => {
          setConfirmReindex(false);
          skipConfirmRef.current = true;
          void handleSave();
        }}
        onCancel={() => setConfirmReindex(false)}
      />
    </div>
  );
}
