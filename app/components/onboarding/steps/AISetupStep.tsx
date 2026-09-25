import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import AIProviderList from '@/components/settings/ai/AIProviderList';
import AIProviderDetail from '@/components/settings/ai/AIProviderDetail';
import AIChatProviderPanels from '@/components/settings/ai/AIChatProviderPanels';
import {
  buildAISaveConfig,
  loadCloudApiKey,
  loadLocalCompatBaseUrl,
  loadProviderSlotApiKey,
  parseLoadedAIConfig,
} from '@/components/settings/ai/aiSectionHelpers';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import {
  LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS,
  getDefaultModelId,
  isLocalOpenAICompatProvider,
  type AIProviderType,
} from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import { providerKind, type ProviderKind } from '@/lib/ai/provider-groups';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface AISetupStepProps {
  progress: OnboardingProgress;
  /** User chose "local mode" at the account gate: never offer Dome here. */
  localModeOnly: boolean;
  /** Account login pulled AI preferences from cloud sync. */
  syncedFromCloud: boolean;
  onNext: (provider: AIProviderType | null) => void;
  onBack?: () => void;
}

const STATUS_POLL_MS = 2500;

/** Dome can connect later; other accounts must be signed in; local servers must answer; API keys must exist. */
function isReady(
  kind: ProviderKind,
  s: { provider: AIProviderType; connected: boolean; localAvailable: boolean | null; hasModel: boolean; hasKey: boolean },
): boolean {
  switch (kind) {
    case 'subscription':
      return s.provider === 'dome' || s.connected;
    case 'local':
      return s.localAvailable === true && (s.provider === 'ollama' || s.hasModel);
    case 'cloud':
      return s.hasKey || s.connected;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

async function fetchProviderStatus(): Promise<Record<string, boolean>> {
  const res = await globalThis.window?.electron?.invoke('db:settings:aiProviderKeyStatus');
  return res?.success && res.data ? (res.data as Record<string, boolean>) : {};
}

/** Same provider list + detail as Settings → AI, compact, with "set up later". */
export default function AISetupStep({ progress, localModeOnly, syncedFromCloud, onNext, onBack }: AISetupStepProps) {
  const { t } = useTranslation();
  const domeAvailable = DOME_PROVIDER_ENABLED && !localModeOnly;
  const [provider, setProvider] = useState<AIProviderType>(domeAvailable ? 'dome' : 'openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(() => getDefaultModelId(domeAvailable ? 'dome' : 'openai'));
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [localCompatBaseURL, setLocalCompatBaseURL] = useState<string>(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS.lmstudio);
  const [localAvailable, setLocalAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { models, loading: modelsLoading } = useProviderModels({
    provider,
    apiKey,
    baseUrl: isLocalOpenAICompatProvider(provider) ? localCompatBaseURL : undefined,
  });

  const refreshStatus = useCallback(() => {
    fetchProviderStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    getAIConfig()
      .then((config) => {
        if (!config?.provider) return;
        const loaded = parseLoadedAIConfig(config);
        if (loaded.provider === 'dome' && !domeAvailable) return;
        setProvider(loaded.provider);
        setApiKey(loaded.apiKey);
        setModel(loaded.model);
        setCustomModel(loaded.customModel);
        setOllamaBaseURL(loaded.ollamaBaseURL);
        setOllamaModel(loaded.ollamaModel);
        setOllamaApiKey(loaded.ollamaApiKey);
        setLocalCompatBaseURL(loaded.localCompatBaseURL);
      })
      .catch(() => undefined);
    refreshStatus();
  }, [domeAvailable, refreshStatus]);

  // OAuth sign-in happens in the browser: poll until the provider reports connected.
  const waitingForOAuth = providerKind(provider) === 'subscription' && provider !== 'dome' && !status[provider];
  useEffect(() => {
    if (!waitingForOAuth) return undefined;
    const timer = globalThis.setInterval(refreshStatus, STATUS_POLL_MS);
    globalThis.addEventListener('focus', refreshStatus);
    return () => {
      globalThis.clearInterval(timer);
      globalThis.removeEventListener('focus', refreshStatus);
    };
  }, [waitingForOAuth, refreshStatus]);

  const selectProvider = (next: AIProviderType) => {
    setProvider(next);
    setCustomModel(false);
    setModel(getDefaultModelId(next));
    setLocalAvailable(null);
    setSaveError(null);
    if (isCloudAIProvider(next)) {
      loadCloudApiKey(next).then(setApiKey).catch(() => setApiKey(''));
    } else if (isLocalOpenAICompatProvider(next)) {
      setLocalCompatBaseURL(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[next]);
      loadProviderSlotApiKey(next).then(setApiKey).catch(() => setApiKey(''));
      loadLocalCompatBaseUrl(next).then(setLocalCompatBaseURL).catch(() => undefined);
    } else {
      setApiKey('');
    }
  };

  const canProceed = isReady(providerKind(provider), {
    provider,
    connected: Boolean(status[provider]),
    localAvailable,
    hasModel: model.trim().length > 0,
    hasKey: apiKey.trim().length > 0,
  });

  const save = () => {
    setSaving(true);
    setSaveError(null);
    const config = buildAISaveConfig({
      provider,
      model,
      apiKey,
      ollamaBaseURL,
      ollamaModel,
      ollamaApiKey,
      localCompatBaseURL,
    });
    saveAIConfig(config)
      .then(() => {
        globalThis.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
        onNext(provider);
      })
      .catch((error: unknown) => {
        console.error('[AISetupStep] save failed:', error);
        setSaveError(t('onboarding.error_saving_config'));
      })
      .finally(() => setSaving(false));
  };

  return (
    <OnboardingStep
      message={t('onboarding.ai_message')}
      progress={progress}
      onNext={save}
      onBack={onBack}
      canProceed={canProceed}
      busy={saving}
      width="wide"
      secondaryAction={
        <Button type="button" variant="ghost" size="sm" onClick={() => onNext(null)} disabled={saving}>
          {t('onboarding.configure_later')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {saveError ? (
          <Alert variant="destructive" role="note">
            <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
            <AlertDescription className="text-xs">{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {syncedFromCloud ? (
          <Alert role="note">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden />
            <AlertDescription className="text-xs">{t('onboarding.ai_synced_from_cloud')}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] md:items-start">
          <AIProviderList
            selected={provider}
            active={null}
            configured={status}
            onSelect={selectProvider}
            hideDome={!domeAvailable}
            className="md:max-h-[55vh]"
          />
          <AIProviderDetail provider={provider} active={null} configured={Boolean(status[provider])}>
            <AIChatProviderPanels
              provider={provider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              model={model}
              onModelChange={setModel}
              customModel={customModel}
              onCustomModelChange={setCustomModel}
              ollamaBaseURL={ollamaBaseURL}
              onOllamaBaseURLChange={setOllamaBaseURL}
              ollamaModel={ollamaModel}
              onOllamaModelChange={setOllamaModel}
              ollamaApiKey={ollamaApiKey}
              onOllamaApiKeyChange={setOllamaApiKey}
              localCompatBaseURL={localCompatBaseURL}
              onLocalCompatBaseURLChange={setLocalCompatBaseURL}
              currentProviderModels={models}
              providerModelsLoading={modelsLoading}
              onTestResult={() => refreshStatus()}
              groupTitle={t('settings.ai.configuration')}
              onLocalAvailabilityChange={setLocalAvailable}
              compact
            />
          </AIProviderDetail>
        </div>
      </div>
    </OnboardingStep>
  );
}
