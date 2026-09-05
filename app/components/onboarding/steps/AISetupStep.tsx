import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, ArrowRight01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { getAIConfig, saveAIConfig } from '@/lib/settings';
import type { AISettings } from '@/types';
import {
  LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS,
  getDefaultModelId,
  isLocalOpenAICompatProvider,
  type AIProviderType,
} from '@/lib/ai/models';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { isCloudAIProvider } from '@/lib/ai/isCloudAIProvider';
import AIProviderSelection from '@/components/settings/ai/AIProviderSelection';
import AICloudProviderConfig from '@/components/settings/ai/AICloudProviderConfig';
import AIOllamaProviderConfig from '@/components/settings/ai/AIOllamaProviderConfig';
import AILocalOpenAICompatConfig from '@/components/settings/ai/AILocalOpenAICompatConfig';
import AIDomeOnboardingCallout from '@/components/settings/ai/AIDomeOnboardingCallout';

import { Alert, AlertDescription } from '@/components/ui/alert';
interface AISetupStepProps {
  onComplete: () => void;
  onValidationChange?: (isValid: boolean) => void;
  /** Onboarding-only: user chose "local mode" at the account gate — never offer/default to Dome here. */
  localModeOnly?: boolean;
  /** Account login pulled AI preferences from cloud sync. */
  syncedFromCloud?: boolean;
}

type OnboardingProviderType = AIProviderType | 'skip';

export default function AISetupStep({
  onComplete,
  onValidationChange,
  localModeOnly = false,
  syncedFromCloud = false,
}: AISetupStepProps) {
  const { t } = useTranslation();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const domeAvailable = DOME_PROVIDER_ENABLED && !localModeOnly;

  const [provider, setProvider] = useState<OnboardingProviderType>(
    domeAvailable ? 'dome' : 'openai',
  );
  const [lastProvider, setLastProvider] = useState<AIProviderType>(
    domeAvailable ? 'dome' : 'openai',
  );
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(() => getDefaultModelId('openai'));
  const [customModel, setCustomModel] = useState(false);
  const [ollamaBaseURL, setOllamaBaseURL] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [localCompatBaseURL, setLocalCompatBaseURL] = useState(
    LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS.lmstudio,
  );
  const [localCompatAvailable, setLocalCompatAvailable] = useState<boolean | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canProceed =
    provider === 'skip' ||
    provider === 'dome' ||
    (provider === 'ollama' && ollamaAvailable === true) ||
    (isLocalOpenAICompatProvider(provider) && localCompatAvailable === true && model.trim().length > 0) ||
    (isCloudAIProvider(provider) && apiKey.trim().length > 0);

  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  const handleNext = useCallback(async () => {
    setSaveError(null);

    if (provider === 'skip') {
      onCompleteRef.current();
      return;
    }

    if (provider === 'dome') {
      try {
        await saveAIConfig({ provider: 'dome' });
        window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
        onCompleteRef.current();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : t('onboarding.error_saving_config'));
      }
      return;
    }

    const config: Partial<AISettings> = {
      provider: provider as AIProviderType,
    };

    if (isCloudAIProvider(provider)) {
      if (!apiKey.trim()) return;
      config.api_key = apiKey;
      config.model = model;
    }

    if (provider === 'ollama') {
      config.ollama_base_url = ollamaBaseURL;
      config.ollama_model = ollamaModel;
    }

    if (isLocalOpenAICompatProvider(provider)) {
      config.base_url = localCompatBaseURL;
      config.model = model;
      if (apiKey.trim()) config.api_key = apiKey;
    }

    try {
      await saveAIConfig(config);
      window.dispatchEvent(new CustomEvent('dome:ai-config-changed'));
      onCompleteRef.current();
    } catch (error) {
      console.error('[AISetupStep] Error al guardar:', error);
      setSaveError(error instanceof Error ? error.message : t('onboarding.error_saving_config'));
    }
  }, [provider, apiKey, model, ollamaBaseURL, ollamaModel, localCompatBaseURL, t]);

  useEffect(() => {
    const handleFinalize = () => void handleNext();
    window.addEventListener('onboarding:finalize', handleFinalize);
    return () => window.removeEventListener('onboarding:finalize', handleFinalize);
  }, [handleNext]);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAIConfig();
      if (config?.provider) {
        const loadedProvider = (config.provider as string) === 'local' ? 'ollama' : config.provider;
        setProvider(loadedProvider as OnboardingProviderType);
        setApiKey(config.api_key || '');
        setModel(config.model || getDefaultModelId(loadedProvider as AIProviderType));
        setOllamaBaseURL(config.ollama_base_url || 'http://localhost:11434');
        setOllamaModel(config.ollama_model || 'llama3.2');
        if (isLocalOpenAICompatProvider(loadedProvider as AIProviderType)) {
          setLocalCompatBaseURL(
            config.base_url ||
              LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[loadedProvider as 'vllm' | 'lmstudio'],
          );
        }
      }
    };
    void loadConfig();
  }, []);

  const handleProviderSelect = (newProvider: OnboardingProviderType) => {
    setProvider(newProvider);
    if (newProvider !== 'skip' && newProvider !== 'ollama' && newProvider !== 'dome') {
      setCustomModel(false);
      setModel(getDefaultModelId(newProvider));
      setLastProvider(newProvider);
      if (isLocalOpenAICompatProvider(newProvider)) {
        setLocalCompatBaseURL(LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URLS[newProvider]);
        setLocalCompatAvailable(null);
      }
    } else if (newProvider === 'ollama' || newProvider === 'dome') {
      setLastProvider(newProvider);
    }
  };

  const handleCloudProviderChange = (newProvider: AIProviderType) => {
    handleProviderSelect(newProvider);
  };

  const displayProvider = provider === 'skip' ? lastProvider : provider;

  return (
    <div className="flex flex-col gap-y-4">
      {saveError ? (
        <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircleIcon} aria-hidden /><AlertDescription className="text-xs">{saveError}</AlertDescription></Alert>
      ) : null}

      {syncedFromCloud && provider !== 'skip' ? (
        <Alert role="note"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden /><AlertDescription className="text-xs">{t('onboarding.ai_synced_from_cloud')}</AlertDescription></Alert>
      ) : null}

      <AIProviderSelection
        provider={displayProvider}
        onProviderChange={handleCloudProviderChange}
        showSectionLabel={false}
        highlightSelection={provider !== 'skip'}
        hideDomeProvider={localModeOnly}
      />

      <Button
        type="button"
        variant={provider === 'skip' ? 'secondary' : 'ghost'}
        onClick={() => handleProviderSelect('skip')}
        className="w-full text-xs"
      >
        {t('onboarding.configure_later')} <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
      </Button>

      {provider !== 'skip' && isCloudAIProvider(provider) && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
            {t('settings.ai.configuration')}
          </p>
          <AICloudProviderConfig
            provider={provider}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            model={model}
            onModelChange={setModel}
            customModel={customModel}
            onCustomModelChange={setCustomModel}
            compact
          />
        </div>
      )}

      {provider === 'ollama' && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
            {t('settings.ai.configuration')}
          </p>
          <AIOllamaProviderConfig
            ollamaBaseURL={ollamaBaseURL}
            onOllamaBaseURLChange={setOllamaBaseURL}
            ollamaModel={ollamaModel}
            onOllamaModelChange={setOllamaModel}
            showApiKeyField={false}
            showOcrHint={false}
            onAvailabilityChange={setOllamaAvailable}
          />
        </div>
      )}

      {isLocalOpenAICompatProvider(provider) && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
            {t('settings.ai.configuration')}
          </p>
          <AILocalOpenAICompatConfig
            provider={provider}
            baseURL={localCompatBaseURL}
            onBaseURLChange={setLocalCompatBaseURL}
            model={model}
            onModelChange={setModel}
            showApiKeyField={false}
            onAvailabilityChange={setLocalCompatAvailable}
          />
        </div>
      )}

      {provider === 'dome' && <AIDomeOnboardingCallout />}
    </div>
  );
}
