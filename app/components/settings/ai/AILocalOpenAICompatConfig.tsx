import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { fetchProviderModels } from '@/lib/ai/client';
import {
  LOCAL_CHAT_CONTEXT_FALLBACK,
  parseContextWindow,
  persistContextWindow,
  readPersistedContextWindow,
} from '@/lib/ai/context-window';
import {
  LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS,
  type LocalOpenAICompatProvider,
} from '@/lib/ai/models';
import { saveAIConfig } from '@/lib/settings';
import ModelSelector from '../ModelSelector';
import { cn } from '@/lib/utils';

export interface AILocalOpenAICompatConfigProps {
  provider: LocalOpenAICompatProvider;
  baseURL: string;
  onBaseURLChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  apiKey?: string;
  onApiKeyChange?: (value: string) => void;
  showApiKeyField?: boolean;
  wrapInCard?: boolean;
  onAvailabilityChange?: (available: boolean | null) => void;
}

type LocalOpenAICompatModel = {
  id: string;
  name: string;
  contextWindow: number;
};

/** Local OpenAI-compatible endpoint (vLLM / LM Studio): URL, optional key, live models. */
export default function AILocalOpenAICompatConfig({
  provider,
  baseURL,
  onBaseURLChange,
  model,
  onModelChange,
  apiKey = '',
  onApiKeyChange,
  showApiKeyField = true,
  wrapInCard = true,
  onAvailabilityChange,
}: AILocalOpenAICompatConfigProps) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [models, setModels] = useState<LocalOpenAICompatModel[]>([]);
  const [contextWindowInput, setContextWindowInput] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const placeholder = LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[provider];
  const hintKey =
    provider === 'lmstudio' ? 'settings.ai.local_openai_install_lmstudio' : 'settings.ai.local_openai_install_vllm';
  const docsUrl = provider === 'lmstudio' ? 'https://lmstudio.ai/docs' : 'https://docs.vllm.ai';

  const persistBaseUrl = useCallback(async () => {
    await saveAIConfig({ provider, base_url: baseURL });
  }, [provider, baseURL]);

  const applyModelRows = useCallback((result: Awaited<ReturnType<typeof fetchProviderModels>>) => {
    const rows =
      result.success && Array.isArray(result.models)
        ? result.models.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            contextWindow: parseContextWindow(m.contextWindow),
          }))
        : [];
    setModels(rows);
    return rows;
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!window.electron) return;
    setChecking(true);
    setLoadingModels(true);
    try {
      const result = await fetchProviderModels(provider, apiKey, baseURL);
      const ok = result.success === true;
      setAvailable(ok);
      setStatusError(ok ? null : result.error || t('settings.ai.local_openai_unreachable'));
      onAvailabilityChange?.(ok);
      applyModelRows(result);
      if (!ok) onAvailabilityChange?.(false);
    } catch (err) {
      setAvailable(false);
      setModels([]);
      setStatusError(err instanceof Error ? err.message : t('settings.ai.local_openai_unreachable'));
      onAvailabilityChange?.(false);
    } finally {
      setChecking(false);
      setLoadingModels(false);
    }
  }, [apiKey, applyModelRows, baseURL, onAvailabilityChange, provider, t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const selected = models.find((m) => m.id === model);
    const fromList = parseContextWindow(selected?.contextWindow);
    let cancelled = false;
    void (async () => {
      const persisted = await readPersistedContextWindow(provider);
      if (cancelled) return;
      const next = fromList || persisted;
      setContextWindowInput(next > 0 ? String(next) : '');
      if (fromList > 0) {
        await persistContextWindow(provider, fromList);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [model, models, provider]);

  return (
    <div className={cn('flex flex-col gap-4', wrapInCard && 'rounded-xl border bg-card p-4')}>
      <LocalOpenAIStatusRow
        checking={checking}
        available={available}
        onCheck={() => {
          void persistBaseUrl()
            .then(() => refreshStatus())
            .catch(() => {});
        }}
      />

      <LocalOpenAIAlerts
        available={available}
        models={models}
        loadingModels={loadingModels}
        statusError={statusError}
        hintKey={hintKey}
        docsUrl={docsUrl}
        provider={provider}
      />

      <Field>
        <FieldLabel htmlFor={`ai-${provider}-url`}>{t('settings.ai.base_url')}</FieldLabel>
        <Input
          id={`ai-${provider}-url`}
          type="url"
          value={baseURL}
          onChange={(e) => onBaseURLChange(e.target.value)}
          onBlur={() => {
            void persistBaseUrl().catch(() => {});
          }}
          placeholder={placeholder}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.ai.local_openai_api_key_hint')}</p>
      </Field>

      {showApiKeyField && onApiKeyChange ? (
        <Field>
          <FieldLabel htmlFor={`ai-${provider}-api-key`}>
            API Key{' '}
            <span className="font-normal normal-case opacity-60">
              ({t('settings.ai.api_key_optional_label')})
            </span>
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={`ai-${provider}-api-key`}
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              autoComplete="off"
            />
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? t('settings.ai.hide_api_key') : t('settings.ai.show_api_key')}
              >
                <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      ) : null}

      <LocalOpenAIModelField
        models={models}
        loading={loadingModels}
        model={model}
        provider={provider}
        onModelChange={onModelChange}
        onRefresh={() => {
          void refreshStatus().catch(() => {});
        }}
        onPersistContextWindow={persistContextWindow}
      />

      <Field>
        <FieldLabel htmlFor={`ai-${provider}-context-window`}>
          {t('settings.ai.context_window')}
        </FieldLabel>
        <Input
          id={`ai-${provider}-context-window`}
          type="number"
          min={512}
          step={512}
          value={contextWindowInput}
          onChange={(e) => setContextWindowInput(e.target.value)}
          onBlur={() => {
            const n = parseContextWindow(contextWindowInput);
            if (n > 0) {
              void persistContextWindow(provider, n);
              setContextWindowInput(String(n));
              return;
            }
            setContextWindowInput('');
          }}
          placeholder={String(LOCAL_CHAT_CONTEXT_FALLBACK)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.ai.context_window_hint')}</p>
      </Field>
    </div>
  );
}

interface LocalOpenAIStatusRowProps {
  checking: boolean;
  available: boolean | null;
  onCheck: () => void;
}

function LocalOpenAIStatusRow({ checking, available, onCheck }: LocalOpenAIStatusRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('settings.ai.status')}
        </span>
        <LocalOpenAIStatusBadge checking={checking} available={available} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCheck}
        disabled={checking}
      >
        {checking ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
        )}
        {t('settings.ai.test_btn')}
      </Button>
    </div>
  );
}

interface LocalOpenAIStatusBadgeProps {
  checking: boolean;
  available: boolean | null;
}

function LocalOpenAIStatusBadge({ checking, available }: LocalOpenAIStatusBadgeProps) {
  const { t } = useTranslation();
  if (checking) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Spinner /> {t('settings.ai.status_checking')}
      </span>
    );
  }
  if (available === true) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} /> {t('settings.ai.status_connected')}
      </span>
    );
  }
  if (available === false) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-destructive">
        <HugeiconsIcon icon={CancelCircleIcon} /> {t('settings.ai.status_disconnected')}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{t('settings.ai.status_unverified')}</span>;
}

interface LocalOpenAIAlertsProps {
  available: boolean | null;
  models: LocalOpenAICompatModel[];
  loadingModels: boolean;
  statusError: string | null;
  hintKey: string;
  docsUrl: string;
  provider: LocalOpenAICompatProvider;
}

function LocalOpenAIAlerts({
  available,
  models,
  loadingModels,
  statusError,
  hintKey,
  docsUrl,
  provider,
}: LocalOpenAIAlertsProps) {
  const { t } = useTranslation();
  return (
    <>
      {available === false ? (
        <Alert role="note" variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="flex flex-col gap-1 text-xs">
            <span>
              {t(hintKey)}{' '}
              <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                {docsUrl.replace(/^https:\/\//, '')}
              </a>
            </span>
            {statusError ? <span className="font-mono text-[11px] opacity-90">{statusError}</span> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {available === true && models.length === 0 && !loadingModels ? (
        <Alert role="note">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="text-xs">
            {t(
              provider === 'lmstudio'
                ? 'settings.ai.local_openai_no_models_lmstudio'
                : 'settings.ai.local_openai_no_models_vllm',
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

interface LocalOpenAIModelFieldProps {
  models: LocalOpenAICompatModel[];
  loading: boolean;
  model: string;
  provider: LocalOpenAICompatProvider;
  onModelChange: (value: string) => void;
  onRefresh: () => void;
  onPersistContextWindow: (provider: LocalOpenAICompatProvider, tokens: number) => Promise<void>;
}

function LocalOpenAIModelField({
  models,
  loading,
  model,
  provider,
  onModelChange,
  onRefresh,
  onPersistContextWindow,
}: LocalOpenAIModelFieldProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('settings.ai.chat_model')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={loading}
        >
          <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
          {t('settings.ai.refresh')}
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <Spinner className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('settings.ai.loading_models')}</span>
        </div>
      ) : models.length > 0 ? (
        <ModelSelector
          models={models.map((m) => ({
            id: m.id,
            name: m.name,
            description: '',
            reasoning: false,
            input: ['text'],
            contextWindow: m.contextWindow,
            maxTokens: 0,
          }))}
          selectedModelId={model}
          onChange={(id) => {
            onModelChange(id);
            const listed = models.find((m) => m.id === id);
            const ctx = parseContextWindow(listed?.contextWindow);
            if (ctx > 0) {
              void onPersistContextWindow(provider, ctx);
            }
          }}
          searchable
          showBadges={false}
          showDescription={false}
          showContextWindow
          placeholder={t('settings.ai.select_local_model')}
          disabled={loading}
          providerType="ollama"
          providerId={provider}
        />
      ) : (
        <Input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={t('settings.ai.select_local_model')}
          aria-label={t('settings.ai.chat_model')}
        />
      )}
    </div>
  );
}
